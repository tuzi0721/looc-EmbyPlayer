use std::sync::Arc;

use serde::Deserialize;
use tauri::State;

use crate::emby::models::{ItemsResponse, MediaItem, PlaybackProgress, UserData, ViewsResponse};
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
            play_method: sanitize_play_method(&v.play_method).into(),
            volume_level: v.volume_level,
        }
    }
}

fn sanitize_play_method(value: &str) -> &'static str {
    if value == "DirectStream" {
        "DirectStream"
    } else {
        "DirectPlay"
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListItemsPayload {
    pub parent_id: Option<String>,
    #[serde(default)]
    pub params: Vec<(String, String)>,
}

fn active_pair(
    state: &AppState,
) -> AppResult<(
    crate::config::models::Server,
    crate::config::models::Account,
)> {
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
        .list_items(
            &server,
            &account,
            payload.parent_id.as_deref(),
            &payload.params,
        )
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemUserDataPayload {
    pub item_id: String,
    pub value: bool,
}

#[tauri::command]
pub async fn set_item_favorite(
    state: State<'_, Arc<AppState>>,
    payload: ItemUserDataPayload,
) -> AppResult<UserData> {
    let (server, account) = active_pair(&state)?;
    state
        .emby
        .set_favorite(&server, &account, &payload.item_id, payload.value)
        .await
}

#[tauri::command]
pub async fn set_item_played(
    state: State<'_, Arc<AppState>>,
    payload: ItemUserDataPayload,
) -> AppResult<UserData> {
    let (server, account) = active_pair(&state)?;
    state
        .emby
        .set_played(&server, &account, &payload.item_id, payload.value)
        .await
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
        .list_episodes(
            &server,
            &account,
            &payload.series_id,
            payload.season_id.as_deref(),
        )
        .await
}

#[tauri::command]
pub async fn similar_items(
    state: State<'_, Arc<AppState>>,
    item_id: String,
    limit: Option<i32>,
) -> AppResult<ItemsResponse> {
    let (server, account) = active_pair(&state)?;
    state
        .emby
        .similar_items(&server, &account, &item_id, limit)
        .await
}

#[tauri::command]
pub async fn special_features(
    state: State<'_, Arc<AppState>>,
    item_id: String,
    limit: Option<i32>,
) -> AppResult<ItemsResponse> {
    let (server, account) = active_pair(&state)?;
    state
        .emby
        .special_features(&server, &account, &item_id, limit)
        .await
}

#[tauri::command]
pub async fn report_playback_progress(
    state: State<'_, Arc<AppState>>,
    progress: PlaybackProgressInput,
) -> AppResult<()> {
    let (server, account) = active_pair(&state)?;
    let mut p: PlaybackProgress = progress.into();
    if let Some(session) = state.current_play_session.lock().await.as_ref() {
        if session.play_session_id == p.play_session_id {
            p.play_method = sanitize_play_method(&session.play_method).into();
        }
    }
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
