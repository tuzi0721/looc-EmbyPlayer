use std::sync::Arc;

use serde::Deserialize;
use tauri::State;

use crate::emby::models::{ItemsResponse, MediaItem, PlaybackProgress, ViewsResponse};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackProgressInput {
    pub item_id: String,
    pub play_session_id: String,
    pub position_ticks: i64,
    pub is_paused: bool,
    pub play_method: String,
    pub volume_level: i32,
}

impl From<PlaybackProgressInput> for PlaybackProgress {
    fn from(v: PlaybackProgressInput) -> Self {
        PlaybackProgress {
            item_id: v.item_id,
            play_session_id: v.play_session_id,
            position_ticks: v.position_ticks,
            is_paused: v.is_paused,
            play_method: v.play_method,
            volume_level: v.volume_level,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListItemsPayload {
    pub parent_id: Option<String>,
    #[serde(default)]
    pub params: Vec<(String, String)>,
}

fn active_pair(state: &AppState) -> AppResult<(crate::config::models::Server, crate::config::models::Account)> {
    let account = state
        .config
        .active_account()
        .ok_or_else(|| AppError::InvalidState("no active account".into()))?;
    let server = state
        .config
        .server(&account.server_id)
        .ok_or_else(|| AppError::NotFound(account.server_id.clone()))?;
    Ok((server, account))
}

#[tauri::command]
pub async fn list_views(state: State<'_, Arc<AppState>>) -> AppResult<ViewsResponse> {
    let (server, account) = active_pair(&state)?;
    state.emby.list_views(&server, &account).await
}

#[tauri::command]
pub async fn list_items(
    state: State<'_, Arc<AppState>>,
    payload: ListItemsPayload,
) -> AppResult<ItemsResponse> {
    let (server, account) = active_pair(&state)?;
    state
        .emby
        .list_items(&server, &account, payload.parent_id.as_deref(), &payload.params)
        .await
}

#[tauri::command]
pub async fn get_item_detail(
    state: State<'_, Arc<AppState>>,
    item_id: String,
) -> AppResult<MediaItem> {
    let (server, account) = active_pair(&state)?;
    state.emby.get_item(&server, &account, &item_id).await
}

#[tauri::command]
pub async fn search(state: State<'_, Arc<AppState>>, term: String) -> AppResult<ItemsResponse> {
    let (server, account) = active_pair(&state)?;
    state.emby.search(&server, &account, &term).await
}

#[tauri::command]
pub async fn resume_items(state: State<'_, Arc<AppState>>) -> AppResult<ItemsResponse> {
    let (server, account) = active_pair(&state)?;
    state.emby.resume_items(&server, &account).await
}

#[tauri::command]
pub async fn list_seasons(
    state: State<'_, Arc<AppState>>,
    series_id: String,
) -> AppResult<ItemsResponse> {
    let (server, account) = active_pair(&state)?;
    state.emby.list_seasons(&server, &account, &series_id).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpisodesPayload {
    pub series_id: String,
    pub season_id: Option<String>,
}

#[tauri::command]
pub async fn list_episodes(
    state: State<'_, Arc<AppState>>,
    payload: EpisodesPayload,
) -> AppResult<ItemsResponse> {
    let (server, account) = active_pair(&state)?;
    state
        .emby
        .list_episodes(&server, &account, &payload.series_id, payload.season_id.as_deref())
        .await
}

#[tauri::command]
pub async fn report_playback_progress(
    state: State<'_, Arc<AppState>>,
    progress: PlaybackProgressInput,
) -> AppResult<()> {
    let (server, account) = active_pair(&state)?;
    let p: PlaybackProgress = progress.into();
    state.emby.report_progress(&server, &account, &p).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoppedPayload {
    pub item_id: String,
    pub play_session_id: String,
    pub position_ticks: i64,
}

#[tauri::command]
pub async fn report_playback_stopped(
    state: State<'_, Arc<AppState>>,
    payload: StoppedPayload,
) -> AppResult<()> {
    let (server, account) = active_pair(&state)?;
    state
        .emby
        .report_stopped(
            &server,
            &account,
            &payload.item_id,
            &payload.play_session_id,
            payload.position_ticks,
        )
        .await
}
