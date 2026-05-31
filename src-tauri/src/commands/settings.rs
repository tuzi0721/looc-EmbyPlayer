use std::sync::Arc;

use serde::Deserialize;
use tauri::State;

use crate::config::models::{AppSettings, HomeHeroStyle, MpvBackendKind, StatsOverlayMode, Theme};
use crate::error::AppResult;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub heartbeat_interval_secs: Option<u64>,
    pub health_check_interval_secs: Option<u64>,
    pub race_timeout_ms: Option<u64>,
    pub request_timeout_ms: Option<u64>,
    pub default_user_agent: Option<String>,
    pub first_run_completed: Option<bool>,
    pub theme: Option<Theme>,
    pub blur_strength: Option<u32>,
    pub enable_window_vibrancy: Option<bool>,
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
    pub screenshot_include_subtitles: Option<bool>,
    pub append_auth_query: Option<bool>,
    pub home_hero_style: Option<HomeHeroStyle>,
    pub close_to_tray: Option<bool>,
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
    pub subtitle_scale: Option<f64>,
    pub subtitle_text_color: Option<String>,
    pub subtitle_outline_color: Option<String>,
    pub subtitle_outline_size: Option<f64>,
    pub subtitle_shadow_offset: Option<f64>,
    pub subtitle_position_pct: Option<u32>,
    pub subtitle_force_style: Option<bool>,
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
        if let Some(v) = patch.first_run_completed {
            s.first_run_completed = v;
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
        if let Some(v) = patch.mpv_backend {
            s.mpv_backend = v;
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
        if let Some(v) = patch.screenshot_include_subtitles {
            s.screenshot_include_subtitles = v;
        }
        if let Some(v) = patch.append_auth_query {
            s.append_auth_query = v;
        }
        if let Some(v) = patch.home_hero_style {
            s.home_hero_style = v;
        }
        if let Some(v) = patch.close_to_tray {
            s.close_to_tray = v;
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
    })?;

    let settings = state.config.settings();
    let need_mpv_rebuild = previous_settings.mpv_backend != settings.mpv_backend;
    if need_mpv_rebuild {
        state.mpv.rebuild(&settings).await?;
    }
    Ok(settings)
}
