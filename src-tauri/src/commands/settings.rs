use std::fs;
use std::sync::Arc;

use chrono::Utc;
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

use crate::commands::shortcuts::{
    self, merge_shortcut_bindings, normalize_shortcut_bindings, ShortcutBinding,
};
use crate::config::models::{
    Account, Anime4kMode, AppSettings, HomeHeroStyle, MpvBackendKind, NetworkProxyMode, Server,
    StatsOverlayMode, Theme,
};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub heartbeat_interval_secs: Option<u64>,
    pub health_check_interval_secs: Option<u64>,
    pub race_timeout_ms: Option<u64>,
    pub request_timeout_ms: Option<u64>,
    pub default_user_agent: Option<String>,
    pub theme: Option<Theme>,
    pub blur_strength: Option<u32>,
    pub enable_window_vibrancy: Option<bool>,
    pub close_to_tray: Option<bool>,
    pub ignore_ssl_errors: Option<bool>,
    pub network_proxy_mode: Option<NetworkProxyMode>,
    pub http_proxy_url: Option<String>,
    pub preferred_audio_language: Option<String>,
    pub preferred_subtitle_language: Option<String>,
    pub force_stereo_audio: Option<bool>,
    pub external_mpv_enabled: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_nullable_field")]
    pub external_mpv_path: Option<Option<String>>,
    pub external_mpv_use_proxy: Option<bool>,
    pub external_potplayer_enabled: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_nullable_field")]
    pub external_potplayer_path: Option<Option<String>>,
    pub mark_watched_threshold_pct: Option<u32>,
    pub mpv_backend: Option<MpvBackendKind>,
    #[serde(default, deserialize_with = "deserialize_nullable_field")]
    pub external_player_path: Option<Option<String>>,
    pub external_player_args: Option<String>,
    pub hardware_decoding: Option<bool>,
    pub mpv_cache_mb: Option<u32>,
    pub hidden_server_ids: Option<Vec<String>>,
    pub hide_jav_codes: Option<bool>,
    pub show_network_speed: Option<bool>,
    pub stats_overlay_mode: Option<StatsOverlayMode>,
    pub blackout_other_displays: Option<bool>,
    pub preserve_track_switch_cache: Option<bool>,
    pub skip_intro_outro_enabled: Option<bool>,
    pub skip_intro_seconds: Option<u32>,
    pub skip_outro_seconds: Option<u32>,
    pub seek_forward_seconds: Option<u32>,
    pub seek_backward_seconds: Option<u32>,
    pub long_press_speed_rate: Option<f64>,
    pub screenshot_include_subtitles: Option<bool>,
    pub append_auth_query: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_nullable_field")]
    pub download_directory: Option<Option<String>>,
    pub home_hero_style: Option<HomeHeroStyle>,
    pub trakt_sync_enabled: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_nullable_field")]
    pub trakt_username: Option<Option<String>>,
    pub trakt_sync_watched: Option<bool>,
    pub trakt_sync_ratings: Option<bool>,
    pub trakt_sync_favorites: Option<bool>,
    pub danmaku_opacity: Option<f32>,
    pub danmaku_speed: Option<f32>,
    pub danmaku_font_size: Option<u32>,
    pub danmaku_avoid_subtitles: Option<bool>,
    pub danmaku_bottom_reserve_pct: Option<u32>,
    pub danmaku_enabled_default: Option<bool>,
    pub danmaku_scroll_max_rows: Option<u32>,
    pub danmaku_top_max_rows: Option<u32>,
    pub danmaku_bottom_max_rows: Option<u32>,
    pub danmaku_bold: Option<bool>,
    pub danmaku_remember_selection: Option<bool>,
    pub subtitle_scale: Option<f64>,
    pub subtitle_text_color: Option<String>,
    pub subtitle_outline_color: Option<String>,
    pub subtitle_outline_size: Option<f64>,
    pub subtitle_shadow_offset: Option<f64>,
    pub subtitle_position_pct: Option<u32>,
    pub subtitle_force_style: Option<bool>,
    pub anime4k_mode: Option<Anime4kMode>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConfigImportMode {
    Merge,
    Replace,
}

impl Default for ConfigImportMode {
    fn default() -> Self {
        Self::Merge
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportConfigPayload {
    #[serde(default)]
    pub mode: ConfigImportMode,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigTransferSummary {
    pub file_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<ConfigImportMode>,
    pub servers: usize,
    pub accounts: usize,
    pub shortcuts: usize,
}

fn deserialize_nullable_field<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

fn normalize_hex_color(input: String, fallback: &str) -> String {
    let value = input.trim();
    let valid = value.len() == 7
        && value.starts_with('#')
        && value[1..].chars().all(|c| c.is_ascii_hexdigit());
    if valid {
        value.to_ascii_uppercase()
    } else {
        fallback.to_string()
    }
}

#[tauri::command]
pub async fn get_settings(state: State<'_, Arc<AppState>>) -> AppResult<AppSettings> {
    Ok(state.config.settings())
}

#[tauri::command]
pub async fn update_settings(
    state: State<'_, Arc<AppState>>,
    patch: SettingsPatch,
) -> AppResult<AppSettings> {
    let previous_settings = state.config.settings();

    state.config.update_settings(|s| {
        if let Some(v) = patch.heartbeat_interval_secs {
            s.heartbeat_interval_secs = v;
        }
        if let Some(v) = patch.health_check_interval_secs {
            s.health_check_interval_secs = v;
        }
        if let Some(v) = patch.race_timeout_ms {
            s.race_timeout_ms = v;
        }
        if let Some(v) = patch.request_timeout_ms {
            s.request_timeout_ms = v;
        }
        if let Some(v) = patch.default_user_agent {
            s.default_user_agent = v;
        }
        if let Some(v) = patch.theme {
            s.theme = v;
        }
        if let Some(v) = patch.blur_strength {
            s.blur_strength = v;
        }
        if let Some(v) = patch.enable_window_vibrancy {
            s.enable_window_vibrancy = v;
        }
        if let Some(v) = patch.close_to_tray {
            s.close_to_tray = v;
        }
        if let Some(v) = patch.ignore_ssl_errors {
            s.ignore_ssl_errors = v;
        }
        if let Some(v) = patch.network_proxy_mode {
            s.network_proxy_mode = v;
        }
        if let Some(v) = patch.http_proxy_url {
            s.http_proxy_url = v.trim().to_string();
        }
        if let Some(v) = patch.preferred_audio_language {
            s.preferred_audio_language = v.trim().to_string();
        }
        if let Some(v) = patch.preferred_subtitle_language {
            s.preferred_subtitle_language = v.trim().to_string();
        }
        if let Some(v) = patch.force_stereo_audio {
            s.force_stereo_audio = v;
        }
        if let Some(v) = patch.external_mpv_enabled {
            s.external_mpv_enabled = v;
        }
        if let Some(v) = patch.external_mpv_path {
            s.external_mpv_path = v
                .map(|p| p.trim().to_string())
                .filter(|p| !p.is_empty());
        }
        if let Some(v) = patch.external_mpv_use_proxy {
            s.external_mpv_use_proxy = v;
        }
        if let Some(v) = patch.external_potplayer_enabled {
            s.external_potplayer_enabled = v;
        }
        if let Some(v) = patch.external_potplayer_path {
            s.external_potplayer_path = v
                .map(|p| p.trim().to_string())
                .filter(|p| !p.is_empty());
        }
        if let Some(v) = patch.mark_watched_threshold_pct {
            s.mark_watched_threshold_pct = v.clamp(50, 100);
        }
        if let Some(v) = patch.mpv_backend {
            s.mpv_backend = v;
        }
        #[cfg(feature = "mpv-embedded")]
        {
            s.mpv_backend = MpvBackendKind::Embedded;
        }
        if let Some(v) = patch.external_player_path {
            s.external_player_path = v.and_then(|path| {
                let path = path.trim().to_string();
                if path.is_empty() {
                    None
                } else {
                    Some(path)
                }
            });
        }
        if let Some(v) = patch.external_player_args {
            s.external_player_args = v.trim().to_string();
        }
        if let Some(v) = patch.hardware_decoding {
            s.hardware_decoding = v;
        }
        if let Some(v) = patch.mpv_cache_mb {
            s.mpv_cache_mb = v;
        }
        if let Some(v) = patch.hidden_server_ids {
            s.hidden_server_ids = v;
        }
        if let Some(v) = patch.hide_jav_codes {
            s.hide_jav_codes = v;
        }
        if let Some(v) = patch.show_network_speed {
            s.show_network_speed = v;
        }
        if let Some(v) = patch.stats_overlay_mode {
            s.stats_overlay_mode = v;
        }
        if let Some(v) = patch.blackout_other_displays {
            s.blackout_other_displays = v;
        }
        if let Some(v) = patch.preserve_track_switch_cache {
            s.preserve_track_switch_cache = v;
        }
        if let Some(v) = patch.skip_intro_outro_enabled {
            s.skip_intro_outro_enabled = v;
        }
        if let Some(v) = patch.skip_intro_seconds {
            s.skip_intro_seconds = v.clamp(0, 600);
        }
        if let Some(v) = patch.skip_outro_seconds {
            s.skip_outro_seconds = v.clamp(0, 600);
        }
        if let Some(v) = patch.seek_forward_seconds {
            s.seek_forward_seconds = v.clamp(1, 300);
        }
        if let Some(v) = patch.seek_backward_seconds {
            s.seek_backward_seconds = v.clamp(1, 300);
        }
        if let Some(v) = patch.long_press_speed_rate {
            s.long_press_speed_rate = v.clamp(1.1, 5.0);
        }
        if let Some(v) = patch.screenshot_include_subtitles {
            s.screenshot_include_subtitles = v;
        }
        if let Some(v) = patch.append_auth_query {
            s.append_auth_query = v;
        }
        if let Some(v) = patch.download_directory {
            s.download_directory = v.and_then(|path| {
                let path = path.trim().to_string();
                if path.is_empty() {
                    None
                } else {
                    Some(path)
                }
            });
        }
        if let Some(v) = patch.home_hero_style {
            s.home_hero_style = v;
        }
        if let Some(v) = patch.trakt_sync_enabled {
            s.trakt_sync_enabled = v;
        }
        if let Some(v) = patch.trakt_username {
            s.trakt_username = v.and_then(|name| {
                let name = name.trim().to_string();
                if name.is_empty() {
                    None
                } else {
                    Some(name)
                }
            });
        }
        if let Some(v) = patch.trakt_sync_watched {
            s.trakt_sync_watched = v;
        }
        if let Some(v) = patch.trakt_sync_ratings {
            s.trakt_sync_ratings = v;
        }
        if let Some(v) = patch.trakt_sync_favorites {
            s.trakt_sync_favorites = v;
        }
        if let Some(v) = patch.danmaku_opacity {
            s.danmaku_opacity = v.clamp(0.2, 1.0);
        }
        if let Some(v) = patch.danmaku_speed {
            s.danmaku_speed = v.clamp(0.5, 2.5);
        }
        if let Some(v) = patch.danmaku_font_size {
            s.danmaku_font_size = v.clamp(12, 48);
        }
        if let Some(v) = patch.danmaku_avoid_subtitles {
            s.danmaku_avoid_subtitles = v;
        }
        if let Some(v) = patch.danmaku_bottom_reserve_pct {
            s.danmaku_bottom_reserve_pct = v.clamp(0, 40);
        }
        if let Some(v) = patch.danmaku_enabled_default {
            s.danmaku_enabled_default = v;
        }
        if let Some(v) = patch.danmaku_scroll_max_rows {
            s.danmaku_scroll_max_rows = v.clamp(1, 20);
        }
        if let Some(v) = patch.danmaku_top_max_rows {
            s.danmaku_top_max_rows = v.clamp(1, 20);
        }
        if let Some(v) = patch.danmaku_bottom_max_rows {
            s.danmaku_bottom_max_rows = v.clamp(1, 20);
        }
        if let Some(v) = patch.danmaku_bold {
            s.danmaku_bold = v;
        }
        if let Some(v) = patch.danmaku_remember_selection {
            s.danmaku_remember_selection = v;
        }
        if let Some(v) = patch.subtitle_scale {
            s.subtitle_scale = v.clamp(0.5, 2.5);
        }
        if let Some(v) = patch.subtitle_text_color {
            let current = s.subtitle_text_color.clone();
            s.subtitle_text_color = normalize_hex_color(v, &current);
        }
        if let Some(v) = patch.subtitle_outline_color {
            let current = s.subtitle_outline_color.clone();
            s.subtitle_outline_color = normalize_hex_color(v, &current);
        }
        if let Some(v) = patch.subtitle_outline_size {
            s.subtitle_outline_size = v.clamp(0.0, 8.0);
        }
        if let Some(v) = patch.subtitle_shadow_offset {
            s.subtitle_shadow_offset = v.clamp(0.0, 8.0);
        }
        if let Some(v) = patch.subtitle_position_pct {
            s.subtitle_position_pct = v.clamp(0, 100);
        }
        if let Some(v) = patch.subtitle_force_style {
            s.subtitle_force_style = v;
        }
        if let Some(v) = patch.anime4k_mode {
            s.anime4k_mode = v;
        }
    })?;

    let settings = state.config.settings();
    let need_mpv_rebuild = previous_settings.mpv_backend != settings.mpv_backend;
    if need_mpv_rebuild {
        state.mpv.rebuild(&settings).await?;
    }
    if previous_settings.anime4k_mode != settings.anime4k_mode {
        let _ = state
            .mpv
            .backend()
            .execute(crate::mpv::MpvCommand::SetAnime4kMode(settings.anime4k_mode))
            .await;
    }
    Ok(settings)
}

#[tauri::command]
pub async fn export_config(
    handle: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> AppResult<Option<ConfigTransferSummary>> {
    let shortcuts = state.shortcuts.snapshot();
    let backup = serde_json::json!({
        "schema": "hills-lite-config",
        "version": 1,
        "exportedAt": Utc::now().to_rfc3339(),
        "data": {
            "settings": state.config.settings(),
            "servers": state.config.servers(),
            "accounts": state.config.accounts(),
            "activeAccountId": state.config.active_account_id(),
            "globalShortcuts": shortcuts,
        },
    });

    let stamp = Utc::now().format("%Y-%m-%d").to_string();
    let Some(file_path) = handle
        .dialog()
        .file()
        .set_title("导出配置")
        .set_file_name(format!("hills-lite-config-{stamp}.json"))
        .add_filter("JSON", &["json"])
        .blocking_save_file()
    else {
        return Ok(None);
    };

    let path = file_path
        .into_path()
        .map_err(|e| AppError::Other(format!("dialog path error: {e}")))?;
    fs::write(
        &path,
        format!("{}\n", serde_json::to_string_pretty(&backup)?),
    )?;

    Ok(Some(ConfigTransferSummary {
        file_path: path.display().to_string(),
        mode: None,
        servers: backup["data"]["servers"].as_array().map_or(0, Vec::len),
        accounts: backup["data"]["accounts"].as_array().map_or(0, Vec::len),
        shortcuts: backup["data"]["globalShortcuts"]
            .as_array()
            .map_or(0, Vec::len),
    }))
}

#[tauri::command]
pub async fn import_config(
    handle: AppHandle,
    state: State<'_, Arc<AppState>>,
    payload: Option<ImportConfigPayload>,
) -> AppResult<Option<ConfigTransferSummary>> {
    let Some(file_path) = handle
        .dialog()
        .file()
        .set_title("导入配置")
        .add_filter("JSON", &["json"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };

    let path = file_path
        .into_path()
        .map_err(|e| AppError::Other(format!("dialog path error: {e}")))?;
    let parsed: Value = serde_json::from_str(&fs::read_to_string(&path)?)?;
    let data = backup_data(&parsed)?;
    let mode = payload.map(|payload| payload.mode).unwrap_or_default();

    let imported_servers: Vec<Server> = parse_array_field(data, "servers")?;
    let imported_accounts: Vec<Account> = parse_array_field(data, "accounts")?;
    let imported_shortcuts = parse_shortcuts(data)?;
    let settings = merge_settings_value(
        data.get("settings"),
        match mode {
            ConfigImportMode::Merge => state.config.settings(),
            ConfigImportMode::Replace => AppSettings::default(),
        },
    )?;

    let current_shortcuts = state.shortcuts.snapshot();
    let next_shortcuts = match (mode, imported_shortcuts) {
        (ConfigImportMode::Replace, Some(shortcuts)) => normalize_shortcut_bindings(shortcuts),
        (ConfigImportMode::Replace, None) => current_shortcuts,
        (ConfigImportMode::Merge, Some(shortcuts)) => {
            merge_shortcut_bindings(current_shortcuts, shortcuts)
        }
        (ConfigImportMode::Merge, None) => current_shortcuts,
    };
    let applied_shortcuts =
        shortcuts::replace_global_shortcuts(&handle, state.inner(), next_shortcuts)?;

    let active_account_id = backup_text(data, "activeAccountId")
        .or_else(|| backup_text(data, "active_account_id"))
        .or_else(|| match mode {
            ConfigImportMode::Merge => state.config.active_account_id(),
            ConfigImportMode::Replace => None,
        });
    let (servers, accounts) = match mode {
        ConfigImportMode::Replace => (imported_servers.clone(), imported_accounts.clone()),
        ConfigImportMode::Merge => (
            merge_servers(state.config.servers(), imported_servers.clone()),
            merge_accounts(state.config.accounts(), imported_accounts.clone()),
        ),
    };

    state
        .config
        .set_config_snapshot(settings, servers, accounts, active_account_id)?;

    let summary = ConfigTransferSummary {
        file_path: path.display().to_string(),
        mode: Some(mode),
        servers: imported_servers.len(),
        accounts: imported_accounts.len(),
        shortcuts: applied_shortcuts.len(),
    };
    handle.emit("config:imported", &summary)?;
    Ok(Some(summary))
}

fn backup_data(parsed: &Value) -> AppResult<&Value> {
    let data = parsed.get("data").unwrap_or(parsed);
    if data.is_object() {
        Ok(data)
    } else {
        Err(AppError::Other("invalid backup file".to_string()))
    }
}

fn parse_array_field<T>(data: &Value, key: &str) -> AppResult<Vec<T>>
where
    T: DeserializeOwned,
{
    match data.get(key) {
        Some(Value::Array(_)) => serde_json::from_value(data[key].clone()).map_err(AppError::from),
        Some(_) => Err(AppError::Other(format!("invalid {key} in backup file"))),
        None => Ok(Vec::new()),
    }
}

fn parse_shortcuts(data: &Value) -> AppResult<Option<Vec<ShortcutBinding>>> {
    match data
        .get("globalShortcuts")
        .or_else(|| data.get("global_shortcuts"))
    {
        Some(Value::Array(value)) => serde_json::from_value(Value::Array(value.clone()))
            .map(Some)
            .map_err(AppError::from),
        Some(_) => Err(AppError::Other(
            "invalid globalShortcuts in backup file".to_string(),
        )),
        None => Ok(None),
    }
}

fn merge_settings_value(value: Option<&Value>, base: AppSettings) -> AppResult<AppSettings> {
    let Some(value) = value else {
        return Ok(base);
    };
    let Value::Object(patch) = value else {
        return Err(AppError::Other(
            "invalid settings in backup file".to_string(),
        ));
    };
    let mut merged = serde_json::to_value(base)?;
    let Some(target) = merged.as_object_mut() else {
        return Err(AppError::Other("invalid settings state".to_string()));
    };
    for (key, value) in patch {
        target.insert(key.clone(), value.clone());
    }
    serde_json::from_value(merged).map_err(AppError::from)
}

fn backup_text(data: &Value, key: &str) -> Option<String> {
    data.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn merge_servers(mut existing: Vec<Server>, incoming: Vec<Server>) -> Vec<Server> {
    for server in incoming {
        if let Some(current) = existing.iter_mut().find(|item| item.id == server.id) {
            *current = server;
        } else {
            existing.push(server);
        }
    }
    existing
}

fn merge_accounts(mut existing: Vec<Account>, incoming: Vec<Account>) -> Vec<Account> {
    for account in incoming {
        if let Some(current) = existing.iter_mut().find(|item| item.id == account.id) {
            *current = account;
        } else {
            existing.push(account);
        }
    }
    existing
}
