use std::sync::Arc;

use serde::Deserialize;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::mpv::{MpvCommand, MpvSnapshot};
use crate::state::{AppState, CurrentPlaySession};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayPayload {
    pub item_id: String,
    #[serde(default)]
    pub start_ms: Option<i64>,
    #[serde(default)]
    pub prefer_direct: bool,
    /// When true, also create a download task that saves the stream while we
    /// watch. The download is registered with the DownloadManager so the
    /// downloads view shows progress.
    #[serde(default)]
    pub record_while_playing: bool,
    /// Forwarded to the download task: pretend a normal playback session.
    #[serde(default = "default_true_payload")]
    pub stealth_when_recording: bool,
}

fn default_true_payload() -> bool {
    true
}

#[tauri::command]
pub async fn play(state: State<'_, Arc<AppState>>, payload: PlayPayload) -> AppResult<String> {
    let account = state
        .config
        .active_account()
        .ok_or_else(|| AppError::InvalidState("no active account".into()))?;
    let server = state
        .config
        .server(&account.server_id)
        .ok_or_else(|| AppError::NotFound(account.server_id.clone()))?;

    let item = state.emby.get_item(&server, &account, &payload.item_id).await?;

    let start_ticks = payload.start_ms.map(|ms| ms * 10_000);
    let pb = state
        .emby
        .playback_info(&server, &account, &payload.item_id, start_ticks)
        .await?;
    let source = pb
        .media_sources
        .first()
        .ok_or_else(|| AppError::InvalidState("no media source".into()))?
        .clone();

    let url = state
        .emby
        .build_stream_url(&server, &account, &item, &source, &pb.play_session_id, payload.prefer_direct)?;

    let line_id = server
        .active_line_id
        .clone()
        .or_else(|| server.lines.first().map(|l| l.id.clone()))
        .ok_or_else(|| AppError::NoLine(server.id.clone()))?;
    let line = server
        .lines
        .iter()
        .find(|l| l.id == line_id)
        .cloned()
        .ok_or_else(|| AppError::NoLine(server.id.clone()))?;

    let ua = line
        .user_agent
        .clone()
        .or_else(|| server.default_user_agent.clone());
    let mut headers = line.headers.clone();
    headers.push(("X-Emby-Token".into(), account.access_token.clone()));

    let mut record_task_id: Option<String> = None;
    let stream_record_path = if payload.record_while_playing {
        let dir = state.downloads.download_dir()?;
        let safe = item
            .name
            .chars()
            .map(|c| match c {
                '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
                other => other,
            })
            .collect::<String>();
        let container = source.container.clone().unwrap_or_else(|| "mkv".into());
        let path = dir.join(format!(
            "{}-{}.{}",
            safe.chars().take(80).collect::<String>(),
            uuid::Uuid::new_v4().simple(),
            container
        ));
        let path_str = path.to_string_lossy().to_string();

        let mut task = crate::download::DownloadTask::new(
            crate::download::DownloadTaskRequest {
                server_id: server.id.clone(),
                account_id: account.id.clone(),
                item_id: item.id.clone(),
                media_source_id: source.id.clone(),
                play_session_id: pb.play_session_id.clone(),
                title: item.name.clone(),
                file_path: path_str.clone(),
                stream_url: url.to_string(),
                container: source.container.clone(),
                total_bytes: source.size.map(|s| s as u64),
                stealth: payload.stealth_when_recording,
            },
        );
        // Watch-while-download: mpv writes the bytes via `--stream-record`,
        // we don't run a separate engine. Mark the task as Running so the
        // downloads view shows it correctly; mpv events update the file on
        // disk and the user can resume from local file later.
        task.status = crate::download::DownloadStatus::Running;
        record_task_id = Some(task.id.clone());
        state.config.upsert_download(task)?;
        Some(path_str)
    } else {
        None
    };

    let backend = state.mpv.backend();
    backend
        .execute(MpvCommand::Load {
            url: url.to_string(),
            headers,
            user_agent: ua,
            start_ms: payload.start_ms,
            stream_record_path,
        })
        .await?;

    *state.current_play_session.lock().await = Some(CurrentPlaySession {
        server_id: server.id.clone(),
        account_id: account.id.clone(),
        item_id: item.id.clone(),
        play_session_id: pb.play_session_id.clone(),
        media_source_id: source.id.clone(),
        record_task_id,
    });

    Ok(pb.play_session_id)
}

#[tauri::command]
pub async fn pause(state: State<'_, Arc<AppState>>) -> AppResult<()> {
    state.mpv.backend().execute(MpvCommand::Pause).await
}

#[tauri::command]
pub async fn resume(state: State<'_, Arc<AppState>>) -> AppResult<()> {
    state.mpv.backend().execute(MpvCommand::Resume).await
}

#[tauri::command]
pub async fn stop(state: State<'_, Arc<AppState>>) -> AppResult<()> {
    let backend = state.mpv.backend();
    if backend.execute(MpvCommand::Stop).await.is_err() {
        backend.shutdown().await?;
    }
    let session = state.current_play_session.lock().await.take();
    if let Some(s) = session {
        if let Some(task_id) = s.record_task_id {
            finalize_recording(&state, &task_id).await;
        }
    }
    Ok(())
}

/// Inspect the on-disk file that mpv wrote via `--stream-record` and update
/// the corresponding `DownloadTask` so the downloads view reflects reality.
async fn finalize_recording(state: &State<'_, Arc<AppState>>, task_id: &str) {
    let Some(mut task) = state.config.download(task_id) else {
        return;
    };
    let size = tokio::fs::metadata(&task.file_path)
        .await
        .map(|m| m.len())
        .unwrap_or(0);
    task.downloaded_bytes = size;
    let complete_enough = match task.total_bytes {
        Some(total) if total > 0 => size as f64 / total as f64 >= 0.995,
        _ => size > 0,
    };
    task.status = if complete_enough {
        crate::download::DownloadStatus::Completed
    } else if size == 0 {
        crate::download::DownloadStatus::Cancelled
    } else {
        crate::download::DownloadStatus::Paused
    };
    task.updated_at = chrono::Utc::now();
    let _ = state.config.upsert_download(task.clone());
    use tauri::Emitter;
    let _ = state.handle.emit("download:state", &task);
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeekPayload {
    pub position_ms: i64,
}

#[tauri::command]
pub async fn seek(state: State<'_, Arc<AppState>>, payload: SeekPayload) -> AppResult<()> {
    state
        .mpv
        .backend()
        .execute(MpvCommand::Seek {
            position_ms: payload.position_ms,
        })
        .await
}

#[derive(Debug, Deserialize)]
pub struct SpeedPayload {
    pub speed: f64,
}

#[tauri::command]
pub async fn set_speed(state: State<'_, Arc<AppState>>, payload: SpeedPayload) -> AppResult<()> {
    state
        .mpv
        .backend()
        .execute(MpvCommand::SetSpeed(payload.speed))
        .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioTrackPayload {
    pub track_id: i64,
}

#[tauri::command]
pub async fn set_audio_track(
    state: State<'_, Arc<AppState>>,
    payload: AudioTrackPayload,
) -> AppResult<()> {
    state
        .mpv
        .backend()
        .execute(MpvCommand::SetAudioTrack(payload.track_id))
        .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleTrackPayload {
    pub track_id: Option<i64>,
}

#[tauri::command]
pub async fn set_subtitle_track(
    state: State<'_, Arc<AppState>>,
    payload: SubtitleTrackPayload,
) -> AppResult<()> {
    state
        .mpv
        .backend()
        .execute(MpvCommand::SetSubtitleTrack(payload.track_id))
        .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumePayload {
    pub volume: i32,
}

#[tauri::command]
pub async fn set_volume(state: State<'_, Arc<AppState>>, payload: VolumePayload) -> AppResult<()> {
    state
        .mpv
        .backend()
        .execute(MpvCommand::SetVolume(payload.volume.clamp(0, 200)))
        .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MutedPayload {
    pub muted: bool,
}

#[tauri::command]
pub async fn set_muted(state: State<'_, Arc<AppState>>, payload: MutedPayload) -> AppResult<()> {
    state
        .mpv
        .backend()
        .execute(MpvCommand::SetMuted(payload.muted))
        .await
}

#[tauri::command]
pub async fn get_state(state: State<'_, Arc<AppState>>) -> AppResult<MpvSnapshot> {
    state.mpv.backend().snapshot().await
}

// ── Embedded MPV (native child window) ──────────────────────────────────────

use crate::mpv::{ParentHandle, PlayerRect};

#[tauri::command]
pub async fn embed_attach(
    state: State<'_, Arc<AppState>>,
    window: tauri::Window,
) -> AppResult<()> {
    let parent = native_parent_handle(&window)?;
    state.mpv.bind_embedded(parent)
}

#[tauri::command]
pub async fn embed_set_rect(
    state: State<'_, Arc<AppState>>,
    rect: PlayerRect,
) -> AppResult<()> {
    state.mpv.embed_rect(rect)
}

#[tauri::command]
pub async fn embed_set_visible(
    state: State<'_, Arc<AppState>>,
    visible: bool,
) -> AppResult<()> {
    state.mpv.embed_show(visible)
}

#[tauri::command]
pub async fn embed_detach(state: State<'_, Arc<AppState>>) -> AppResult<()> {
    state.mpv.detach_embedded().await
}

#[cfg(target_os = "windows")]
fn native_parent_handle(window: &tauri::Window) -> AppResult<ParentHandle> {
    let h = window
        .hwnd()
        .map_err(|e| AppError::Mpv(format!("hwnd: {e}")))?;
    Ok(ParentHandle::Win32(h.0 as isize))
}

#[cfg(not(target_os = "windows"))]
fn native_parent_handle(_window: &tauri::Window) -> AppResult<ParentHandle> {
    Err(AppError::Mpv(
        "embedded MPV currently only supported on Windows".into(),
    ))
}

// ── MPV detection / external links ───────────────────────────────────────────

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MpvDetectResult {
    pub found: bool,
    pub path: String,
    pub bundled: bool,
}

#[tauri::command]
pub async fn detect_mpv(state: State<'_, Arc<AppState>>) -> AppResult<MpvDetectResult> {
    use crate::mpv::paths::{mpv_exists, resolve_mpv_exe};

    let settings = state.config.settings();
    let path = resolve_mpv_exe(&settings);
    let path_str = path.to_string_lossy();
    let bundled = path_str.contains("resources") || path_str.contains("vendor");
    Ok(MpvDetectResult {
        found: mpv_exists(&settings),
        path: path_str.to_string(),
        bundled,
    })
}

#[tauri::command]
pub async fn open_external(url: String) -> AppResult<()> {
    open::that(&url).map_err(|e| AppError::Other(format!("open url: {e}")))?;
    Ok(())
}
