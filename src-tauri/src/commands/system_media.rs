//! Bridges Now Playing metadata / playback state from the frontend down to
//! the OS shell (Windows SMTC; no-op on other platforms).

use std::sync::Arc;

use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;
use crate::system_media::{NowPlayingInfo, PlaybackStatus};

#[tauri::command]
pub async fn set_now_playing(
    state: State<'_, Arc<AppState>>,
    info: NowPlayingInfo,
) -> AppResult<()> {
    state.system_media.update_metadata(&info);
    if let (Some(pos), Some(dur)) = (info.position_ms, info.duration_ms) {
        state.system_media.update_position(pos, dur);
    }
    Ok(())
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackStatusPayload {
    pub status: String,
}

#[tauri::command]
pub async fn set_now_playing_status(
    state: State<'_, Arc<AppState>>,
    payload: PlaybackStatusPayload,
) -> AppResult<()> {
    let status = match payload.status.as_str() {
        "playing" => PlaybackStatus::Playing,
        "paused" => PlaybackStatus::Paused,
        _ => PlaybackStatus::Stopped,
    };
    state.system_media.update_playback(status);
    Ok(())
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionPayload {
    pub position_ms: i64,
    pub duration_ms: i64,
}

#[tauri::command]
pub async fn set_now_playing_position(
    state: State<'_, Arc<AppState>>,
    payload: PositionPayload,
) -> AppResult<()> {
    state
        .system_media
        .update_position(payload.position_ms, payload.duration_ms);
    Ok(())
}

#[tauri::command]
pub async fn clear_now_playing(state: State<'_, Arc<AppState>>) -> AppResult<()> {
    state.system_media.clear();
    Ok(())
}
