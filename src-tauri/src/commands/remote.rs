//! Commands for controlling other Emby/Jellyfin sessions on the same server.

use std::sync::Arc;

use serde::Deserialize;
use serde_json::json;
use tauri::State;

use crate::emby::models::RemoteSession;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[tauri::command]
pub async fn list_remote_sessions(
    state: State<'_, Arc<AppState>>,
) -> AppResult<Vec<RemoteSession>> {
    let account = state
        .config
        .active_account()
        .ok_or_else(|| AppError::InvalidState("no active account".into()))?;
    let server = state
        .config
        .server(&account.server_id)
        .ok_or_else(|| AppError::NotFound(account.server_id.clone()))?;
    state.emby.list_sessions(&server, &account).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotePlaystatePayload {
    pub session_id: String,
    pub command: String,
    #[serde(default)]
    pub seek_position_ticks: Option<i64>,
}

#[tauri::command]
pub async fn remote_playstate(
    state: State<'_, Arc<AppState>>,
    payload: RemotePlaystatePayload,
) -> AppResult<()> {
    let account = state
        .config
        .active_account()
        .ok_or_else(|| AppError::InvalidState("no active account".into()))?;
    let server = state
        .config
        .server(&account.server_id)
        .ok_or_else(|| AppError::NotFound(account.server_id.clone()))?;
    state
        .emby
        .send_playstate(
            &server,
            &account,
            &payload.session_id,
            &payload.command,
            payload.seek_position_ticks,
        )
        .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotePlayPayload {
    pub session_id: String,
    pub item_ids: Vec<String>,
    #[serde(default)]
    pub start_position_ticks: Option<i64>,
}

#[tauri::command]
pub async fn remote_play(
    state: State<'_, Arc<AppState>>,
    payload: RemotePlayPayload,
) -> AppResult<()> {
    let account = state
        .config
        .active_account()
        .ok_or_else(|| AppError::InvalidState("no active account".into()))?;
    let server = state
        .config
        .server(&account.server_id)
        .ok_or_else(|| AppError::NotFound(account.server_id.clone()))?;
    state
        .emby
        .send_play(
            &server,
            &account,
            &payload.session_id,
            &payload.item_ids,
            payload.start_position_ticks,
        )
        .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteVolumePayload {
    pub session_id: String,
    pub volume: i32,
}

#[tauri::command]
pub async fn remote_set_volume(
    state: State<'_, Arc<AppState>>,
    payload: RemoteVolumePayload,
) -> AppResult<()> {
    let account = state
        .config
        .active_account()
        .ok_or_else(|| AppError::InvalidState("no active account".into()))?;
    let server = state
        .config
        .server(&account.server_id)
        .ok_or_else(|| AppError::NotFound(account.server_id.clone()))?;
    state
        .emby
        .send_general_command(
            &server,
            &account,
            &payload.session_id,
            "SetVolume",
            json!({ "Volume": payload.volume }),
        )
        .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteMessagePayload {
    pub session_id: String,
    pub header: String,
    pub text: String,
}

#[tauri::command]
pub async fn remote_display_message(
    state: State<'_, Arc<AppState>>,
    payload: RemoteMessagePayload,
) -> AppResult<()> {
    let account = state
        .config
        .active_account()
        .ok_or_else(|| AppError::InvalidState("no active account".into()))?;
    let server = state
        .config
        .server(&account.server_id)
        .ok_or_else(|| AppError::NotFound(account.server_id.clone()))?;
    state
        .emby
        .send_general_command(
            &server,
            &account,
            &payload.session_id,
            "DisplayMessage",
            json!({
                "Header": payload.header,
                "Text": payload.text,
                "TimeoutMs": 5000,
            }),
        )
        .await
}
