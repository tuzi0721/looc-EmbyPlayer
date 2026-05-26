use std::sync::Arc;

use serde::Deserialize;
use tauri::State;

use crate::config::models::{AppSettings, MpvBackendKind, Theme};
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
    pub theme: Option<Theme>,
    pub blur_strength: Option<u32>,
    pub enable_window_vibrancy: Option<bool>,
    pub mpv_backend: Option<MpvBackendKind>,
    pub mpv_executable_path: Option<String>,
    pub hardware_decoding: Option<bool>,
    pub mpv_cache_mb: Option<u32>,
    pub hidden_server_ids: Option<Vec<String>>,
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
    let need_mpv_rebuild = patch.mpv_backend.is_some() || patch.mpv_executable_path.is_some();

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
        if let Some(v) = patch.mpv_backend {
            s.mpv_backend = v;
        }
        if let Some(v) = patch.mpv_executable_path {
            s.mpv_executable_path = if v.is_empty() { None } else { Some(v) };
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
    })?;

    let settings = state.config.settings();
    if need_mpv_rebuild {
        state.mpv.rebuild(&settings).await?;
    }
    Ok(settings)
}
