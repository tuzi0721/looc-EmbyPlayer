use std::path::Path;
use std::sync::Arc;

use serde::Deserialize;
use tauri::State;
use uuid::Uuid;

use crate::download::task::{DownloadTask, DownloadTaskRequest};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartDownloadPayload {
    pub item_id: String,
    /// Pretend to be a normal playback session while downloading.
    #[serde(default)]
    pub stealth: bool,
    /// Prefer direct stream (the original file). When false, we use the
    /// transcoded master.m3u8 — note that .m3u8 to a single file isn't a
    /// straight save; the player should set `stealth=true, preferDirect=true`
    /// for offline-playable downloads.
    #[serde(default = "default_true")]
    pub prefer_direct: bool,
}

fn default_true() -> bool {
    true
}

#[tauri::command]
pub async fn list_downloads(state: State<'_, Arc<AppState>>) -> AppResult<Vec<DownloadTask>> {
    Ok(state.downloads.list())
}

#[tauri::command]
pub async fn start_download(
    state: State<'_, Arc<AppState>>,
    payload: StartDownloadPayload,
) -> AppResult<DownloadTask> {
    let account = state
        .config
        .active_account()
        .ok_or_else(|| AppError::InvalidState("no active account".into()))?;
    let server = state
        .config
        .server(&account.server_id)
        .ok_or_else(|| AppError::NotFound(account.server_id.clone()))?;

    let item = state
        .emby
        .get_item(&server, &account, &payload.item_id)
        .await?;
    let pb = state
        .emby
        .playback_info(&server, &account, &payload.item_id, None)
        .await?;
    let source = pb
        .media_sources
        .first()
        .ok_or_else(|| AppError::InvalidState("no media source".into()))?
        .clone();

    let url = state.emby.build_stream_url(
        &server,
        &account,
        &item,
        &source,
        &pb.play_session_id,
        payload.prefer_direct,
    )?;

    let container = source.container.clone().unwrap_or_else(|| "mkv".into());
    let safe_name = sanitize_filename(&item.name);
    let dir = state.downloads.download_dir()?;
    let file_path = dir.join(format!(
        "{}-{}.{}",
        safe_name,
        Uuid::new_v4().simple(),
        container
    ));

    let task = DownloadTask::new(DownloadTaskRequest {
        server_id: server.id.clone(),
        account_id: account.id.clone(),
        item_id: item.id.clone(),
        media_source_id: source.id.clone(),
        play_session_id: pb.play_session_id.clone(),
        title: item.name.clone(),
        file_path: file_path.to_string_lossy().to_string(),
        stream_url: url.to_string(),
        container: source.container.clone(),
        total_bytes: source.size.map(|s| s as u64),
        stealth: payload.stealth,
    });

    state.downloads.start(task.clone())?;
    Ok(task)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRefPayload {
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveDownloadPayload {
    pub id: String,
    #[serde(default)]
    pub delete_file: bool,
}

#[tauri::command]
pub async fn pause_download(
    state: State<'_, Arc<AppState>>,
    payload: TaskRefPayload,
) -> AppResult<()> {
    state.downloads.pause(&payload.id)
}

#[tauri::command]
pub async fn resume_download(
    state: State<'_, Arc<AppState>>,
    payload: TaskRefPayload,
) -> AppResult<()> {
    state.downloads.resume(&payload.id)
}

#[tauri::command]
pub async fn cancel_download(
    state: State<'_, Arc<AppState>>,
    payload: TaskRefPayload,
) -> AppResult<()> {
    state.downloads.cancel(&payload.id)
}

#[tauri::command]
pub async fn remove_download(
    state: State<'_, Arc<AppState>>,
    payload: RemoveDownloadPayload,
) -> AppResult<()> {
    state.downloads.remove(&payload.id, payload.delete_file)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayLocalPayload {
    pub id: String,
    #[serde(default)]
    pub start_ms: Option<i64>,
}

#[tauri::command]
pub async fn play_local(
    state: State<'_, Arc<AppState>>,
    payload: PlayLocalPayload,
) -> AppResult<()> {
    let task = state
        .downloads
        .get(&payload.id)
        .ok_or_else(|| AppError::NotFound(payload.id.clone()))?;
    if !Path::new(&task.file_path).exists() {
        return Err(AppError::NotFound(format!(
            "local file missing: {}",
            task.file_path
        )));
    }
    let url = format!("file:///{}", task.file_path.replace('\\', "/"));
    let backend = state.mpv.backend();
    backend
        .execute(crate::mpv::MpvCommand::Load {
            url,
            headers: vec![],
            user_agent: None,
            start_ms: payload.start_ms,
            stream_record_path: None,
        })
        .await?;
    Ok(())
}

fn sanitize_filename(name: &str) -> String {
    let mut s: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            other => other,
        })
        .collect();
    if s.len() > 80 {
        s.truncate(80);
    }
    s
}
