use std::{
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
};

use chrono::Local;
use serde::{Deserialize, Serialize};
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::mpv::backend::MpvBackend;
use crate::mpv::{MpvCommand, MpvSnapshot, PictureMode, SubtitleStyle};
use crate::state::{AppState, CurrentPlaySession};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayPayload {
    pub item_id: String,
    #[serde(default)]
    pub start_ms: Option<i64>,
    #[serde(default)]
    pub prefer_direct: bool,
    #[serde(default)]
    pub line_id: Option<String>,
    #[serde(default)]
    pub media_source_id: Option<String>,
    /// When true, also create a download task that saves the stream while we
    /// watch. The download is registered with the DownloadManager so the
    /// downloads view shows progress.
    #[serde(default)]
    pub record_while_playing: bool,
    /// Forwarded to the download task: pretend a normal playback session.
    #[serde(default = "default_true_payload")]
    pub stealth_when_recording: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayExternalPayload {
    pub item_id: String,
    #[serde(default)]
    pub start_ms: Option<i64>,
    #[serde(default)]
    pub line_id: Option<String>,
    #[serde(default)]
    pub media_source_id: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayFilePayload {
    pub file_path: String,
    #[serde(default)]
    pub start_ms: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListLocalFolderPayload {
    pub directory: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFolderVideo {
    pub file_path: String,
    pub name: String,
    pub extension: String,
    pub size_bytes: u64,
    pub modified_at_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFolderListing {
    pub directory: String,
    pub items: Vec<LocalFolderVideo>,
}

#[derive(Debug)]
struct SidecarSubtitle {
    path: PathBuf,
    title: String,
    rank: usize,
    ext_rank: usize,
}

const SIDECAR_SUBTITLE_EXTENSIONS: &[(&str, usize)] =
    &[("srt", 0), ("ass", 1), ("ssa", 2), ("vtt", 3)];

const LOCAL_VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "mkv", "mov", "avi", "wmv", "flv", "webm", "m4v", "ts", "m2ts", "mpeg", "mpg", "3gp",
    "ogv", "rmvb",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TakeScreenshotPayload {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default = "default_true_payload")]
    pub include_subtitles: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotResult {
    pub file_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecondaryDisplayBlackoutResult {
    pub count: usize,
}

const SECONDARY_BLACKOUT_LABEL_PREFIX: &str = "secondary-blackout-";

fn default_true_payload() -> bool {
    true
}

fn default_stats_osd_page() -> u8 {
    1
}

fn close_secondary_blackout_windows(app: &tauri::AppHandle) {
    for (label, window) in app.webview_windows() {
        if label.starts_with(SECONDARY_BLACKOUT_LABEL_PREFIX) {
            let _ = window.close();
        }
    }
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

    let item = state
        .emby
        .get_item(&server, &account, &payload.item_id)
        .await?;

    let start_ticks = payload.start_ms.map(|ms| ms * 10_000);
    let line_id = payload.line_id.as_deref();
    let pb = state
        .emby
        .playback_info_for_line(&server, &account, &payload.item_id, start_ticks, line_id)
        .await?;
    let source = match payload.media_source_id.as_deref() {
        Some(id) => pb
            .media_sources
            .iter()
            .find(|source| source.id == id)
            .ok_or_else(|| AppError::InvalidState(format!("media source not found: {id}")))?
            .clone(),
        None => pb
            .media_sources
            .first()
            .ok_or_else(|| AppError::InvalidState("no media source".into()))?
            .clone(),
    };

    let url = state.emby.build_stream_url_for_line(
        &server,
        &account,
        &item,
        &source,
        &pb.play_session_id,
        payload.prefer_direct,
        line_id,
    )?;

    let line = state.emby.pick_line(&server, line_id)?;

    let ua = line
        .user_agent
        .clone()
        .or_else(|| server.default_user_agent.clone());
    let mut headers = line.headers.clone();
    headers.push(("X-Emby-Token".into(), account.access_token.clone()));
    headers.push((
        "Authorization".into(),
        format!("MediaBrowser Token=\"{}\"", account.access_token),
    ));

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

        let mut task = crate::download::DownloadTask::new(crate::download::DownloadTaskRequest {
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
        });
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
            autoload_subtitles: true,
        })
        .await?;

    let settings = state.config.settings();
    let subtitle_style = SubtitleStyle {
        scale: settings.subtitle_scale,
        text_color: settings.subtitle_text_color,
        outline_color: settings.subtitle_outline_color,
        outline_size: settings.subtitle_outline_size,
        shadow_offset: settings.subtitle_shadow_offset,
        position_pct: settings.subtitle_position_pct,
        force_style: settings.subtitle_force_style,
    };
    if let Err(error) = backend
        .execute(MpvCommand::SetSubtitleStyle(subtitle_style))
        .await
    {
        tracing::warn!(target = "player", error = %error, "failed to apply subtitle style");
    }

    *state.current_play_session.lock().await = Some(CurrentPlaySession {
        server_id: server.id.clone(),
        account_id: account.id.clone(),
        item_id: item.id.clone(),
        play_session_id: pb.play_session_id.clone(),
        media_source_id: source.id.clone(),
        line_id: line.id.clone(),
        record_task_id,
    });

    Ok(pb.play_session_id)
}

fn sidecar_subtitle_ext_rank(ext: &str) -> Option<usize> {
    SIDECAR_SUBTITLE_EXTENSIONS
        .iter()
        .find_map(|(candidate, rank)| (*candidate == ext).then_some(*rank))
}

fn sidecar_subtitle_rank(video_stem: &str, subtitle_stem: &str) -> Option<usize> {
    let video = video_stem.to_lowercase();
    let subtitle = subtitle_stem.to_lowercase();
    if subtitle == video {
        return Some(0);
    }
    [".", " ", "_", "-"]
        .iter()
        .any(|separator| subtitle.starts_with(&format!("{video}{separator}")))
        .then_some(1)
}

fn find_sidecar_subtitles(video_path: &Path) -> Vec<SidecarSubtitle> {
    let Some(dir) = video_path.parent() else {
        return Vec::new();
    };
    let Some(video_stem) = video_path.file_stem().and_then(|value| value.to_str()) else {
        return Vec::new();
    };
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };

    let mut subtitles = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            if !path.is_file() {
                return None;
            }
            let ext = path.extension()?.to_str()?.to_lowercase();
            let ext_rank = sidecar_subtitle_ext_rank(&ext)?;
            let subtitle_stem = path.file_stem()?.to_str()?;
            let rank = sidecar_subtitle_rank(video_stem, subtitle_stem)?;
            let title = path.file_name()?.to_string_lossy().into_owned();
            Some(SidecarSubtitle {
                path,
                title,
                rank,
                ext_rank,
            })
        })
        .collect::<Vec<_>>();

    subtitles.sort_by(|a, b| {
        a.rank
            .cmp(&b.rank)
            .then(a.ext_rank.cmp(&b.ext_rank))
            .then(a.title.cmp(&b.title))
    });
    subtitles.truncate(8);
    subtitles
}

async fn add_sidecar_subtitles(backend: &Arc<dyn MpvBackend>, video_path: &Path) -> usize {
    let subtitles = find_sidecar_subtitles(video_path);
    let mut loaded = 0usize;
    for (index, subtitle) in subtitles.into_iter().enumerate() {
        let Ok(source) = url::Url::from_file_path(&subtitle.path).map(|url| url.to_string()) else {
            continue;
        };
        if let Err(error) = backend
            .execute(MpvCommand::AddSubtitle {
                source,
                title: Some(subtitle.title.clone()),
                lang: None,
                select: index == 0,
            })
            .await
        {
            tracing::warn!(
                target = "player",
                title = %subtitle.title,
                error = %error,
                "failed to load sidecar subtitle"
            );
            continue;
        }
        loaded += 1;
    }
    if loaded > 0 {
        tracing::info!(target = "player", loaded, "loaded sidecar subtitles");
    }
    loaded
}

#[tauri::command]
pub async fn play_file(state: State<'_, Arc<AppState>>, payload: PlayFilePayload) -> AppResult<()> {
    let path = PathBuf::from(&payload.file_path);
    if !path.is_file() {
        return Err(AppError::NotFound(format!(
            "local file missing: {}",
            payload.file_path
        )));
    }
    let path = std::fs::canonicalize(&path).map_err(|error| {
        AppError::InvalidState(format!(
            "invalid file path: {} ({})",
            payload.file_path, error
        ))
    })?;
    let url = url::Url::from_file_path(&path)
        .map_err(|_| AppError::InvalidState(format!("invalid file path: {}", payload.file_path)))?;
    let backend = state.mpv.backend();
    backend
        .execute(MpvCommand::Load {
            url: url.to_string(),
            headers: vec![],
            user_agent: None,
            start_ms: payload.start_ms,
            stream_record_path: None,
            autoload_subtitles: false,
        })
        .await?;

    let settings = state.config.settings();
    let subtitle_style = SubtitleStyle {
        scale: settings.subtitle_scale,
        text_color: settings.subtitle_text_color,
        outline_color: settings.subtitle_outline_color,
        outline_size: settings.subtitle_outline_size,
        shadow_offset: settings.subtitle_shadow_offset,
        position_pct: settings.subtitle_position_pct,
        force_style: settings.subtitle_force_style,
    };
    if let Err(error) = backend
        .execute(MpvCommand::SetSubtitleStyle(subtitle_style))
        .await
    {
        tracing::warn!(target = "player", error = %error, "failed to apply subtitle style");
    }
    add_sidecar_subtitles(&backend, &path).await;

    *state.current_play_session.lock().await = None;
    Ok(())
}

#[tauri::command]
pub async fn list_local_folder(payload: ListLocalFolderPayload) -> AppResult<LocalFolderListing> {
    let directory = PathBuf::from(payload.directory.trim());
    let directory = std::fs::canonicalize(&directory)
        .map_err(|error| AppError::InvalidState(format!("invalid folder path: {}", error)))?;
    if !directory.is_dir() {
        return Err(AppError::NotFound(format!(
            "local folder missing: {}",
            directory.to_string_lossy()
        )));
    }

    let mut items = Vec::new();
    for entry in std::fs::read_dir(&directory)
        .map_err(|error| AppError::InvalidState(format!("failed to read folder: {}", error)))?
    {
        let entry = entry.map_err(|error| {
            AppError::InvalidState(format!("failed to read folder item: {}", error))
        })?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(extension) = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
        else {
            continue;
        };
        if !LOCAL_VIDEO_EXTENSIONS.contains(&extension.as_str()) {
            continue;
        }
        let metadata = entry.metadata().map_err(|error| {
            AppError::InvalidState(format!("failed to inspect file: {}", error))
        })?;
        if !metadata.is_file() {
            continue;
        }
        let modified_at_ms = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as u64);
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string();
        items.push(LocalFolderVideo {
            file_path: path.to_string_lossy().to_string(),
            name,
            extension,
            size_bytes: metadata.len(),
            modified_at_ms,
        });
    }

    items.sort_by_key(|item| item.name.to_ascii_lowercase());
    Ok(LocalFolderListing {
        directory: directory.to_string_lossy().to_string(),
        items,
    })
}

#[tauri::command]
pub async fn play_external(
    state: State<'_, Arc<AppState>>,
    payload: PlayExternalPayload,
) -> AppResult<()> {
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
    let start_ticks = payload.start_ms.map(|ms| ms * 10_000);
    let line_id = payload.line_id.as_deref();
    let pb = state
        .emby
        .playback_info_for_line(&server, &account, &payload.item_id, start_ticks, line_id)
        .await?;
    let source = match payload.media_source_id.as_deref() {
        Some(id) => pb
            .media_sources
            .iter()
            .find(|source| source.id == id)
            .ok_or_else(|| AppError::InvalidState(format!("media source not found: {id}")))?
            .clone(),
        None => pb
            .media_sources
            .first()
            .ok_or_else(|| AppError::InvalidState("no media source".into()))?
            .clone(),
    };
    let url = state.emby.build_stream_url_for_line(
        &server,
        &account,
        &item,
        &source,
        &pb.play_session_id,
        true,
        line_id,
    )?;

    let line = state.emby.pick_line(&server, line_id)?;
    let user_agent = line
        .user_agent
        .clone()
        .or_else(|| server.default_user_agent.clone());
    let mut headers = line.headers.clone();
    headers.push(("X-Emby-Token".into(), account.access_token.clone()));
    headers.push((
        "Authorization".into(),
        format!("MediaBrowser Token=\"{}\"", account.access_token),
    ));

    let settings = state.config.settings();
    let Some(player_path) = settings
        .external_player_path
        .as_deref()
        .map(str::trim)
        .filter(|path| !path.is_empty())
    else {
        open::that(url.as_str()).map_err(|e| AppError::Other(format!("open stream: {e}")))?;
        return Ok(());
    };

    if !Path::new(player_path).exists() {
        return Err(AppError::Other(format!(
            "external player not found: {player_path}"
        )));
    }

    let args = build_external_player_args(
        &settings.external_player_args,
        player_path,
        url.as_str(),
        payload.title.as_deref().unwrap_or(&item.name),
        user_agent.as_deref(),
        &headers,
        payload.start_ms.unwrap_or_default(),
    );
    Command::new(player_path)
        .args(args)
        .spawn()
        .map_err(|e| AppError::Other(format!("launch external player: {e}")))?;
    Ok(())
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
    let preserve_cache = state.config.settings().preserve_track_switch_cache;
    state
        .mpv
        .backend()
        .execute(MpvCommand::SetAudioTrack {
            id: payload.track_id,
            preserve_cache,
        })
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
    let preserve_cache = state.config.settings().preserve_track_switch_cache;
    state
        .mpv
        .backend()
        .execute(MpvCommand::SetSubtitleTrack {
            id: payload.track_id,
            preserve_cache,
        })
        .await
}

#[tauri::command]
pub async fn set_secondary_subtitle_track(
    state: State<'_, Arc<AppState>>,
    payload: SubtitleTrackPayload,
) -> AppResult<()> {
    state
        .mpv
        .backend()
        .execute(MpvCommand::SetSecondarySubtitleTrack {
            id: payload.track_id,
        })
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PictureModePayload {
    pub mode: PictureMode,
}

#[tauri::command]
pub async fn set_picture_mode(
    state: State<'_, Arc<AppState>>,
    payload: PictureModePayload,
) -> AppResult<()> {
    state
        .mpv
        .backend()
        .execute(MpvCommand::SetPictureMode(payload.mode))
        .await
}

fn sanitize_screenshot_title(title: Option<&str>) -> String {
    let source = title.unwrap_or("Hills Lite");
    let mut collapsed = String::new();
    let mut last_space = false;
    for c in source.chars() {
        let next = match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            other if other.is_control() => '_',
            other => other,
        };
        if next.is_whitespace() {
            if !last_space {
                collapsed.push(' ');
                last_space = true;
            }
        } else {
            collapsed.push(next);
            last_space = false;
        }
    }
    let trimmed = collapsed.trim();
    let limited: String = trimmed.chars().take(80).collect();
    if limited.is_empty() {
        "Hills Lite".into()
    } else {
        limited
    }
}

fn unique_screenshot_path(dir: &Path, title: Option<&str>) -> PathBuf {
    let base = format!(
        "{}-{}",
        sanitize_screenshot_title(title),
        Local::now().format("%Y%m%d-%H%M%S")
    );
    for index in 0..100 {
        let suffix = if index == 0 {
            String::new()
        } else {
            format!("-{}", index + 1)
        };
        let candidate = dir.join(format!("{base}{suffix}.png"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(format!("{base}-{}.png", Uuid::new_v4().simple()))
}

#[tauri::command]
pub async fn take_screenshot(
    state: State<'_, Arc<AppState>>,
    payload: TakeScreenshotPayload,
) -> AppResult<ScreenshotResult> {
    let dir = state
        .handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Other(format!("data dir: {e}")))?
        .join("screenshots");
    std::fs::create_dir_all(&dir)?;
    let file_path = unique_screenshot_path(&dir, payload.title.as_deref());
    let file_path_string = file_path.to_string_lossy().to_string();
    state
        .mpv
        .backend()
        .execute(MpvCommand::ScreenshotToFile {
            path: file_path_string.clone(),
            include_subtitles: payload.include_subtitles,
        })
        .await?;
    Ok(ScreenshotResult {
        file_path: file_path_string,
    })
}

#[tauri::command]
pub async fn get_state(state: State<'_, Arc<AppState>>) -> AppResult<MpvSnapshot> {
    state.mpv.backend().snapshot().await
}

#[tauri::command]
pub async fn show_mpv_stats_osd(
    state: State<'_, Arc<AppState>>,
    page: Option<u8>,
) -> AppResult<()> {
    state
        .mpv
        .backend()
        .execute(MpvCommand::ShowStatsOsd {
            page: page.unwrap_or_else(default_stats_osd_page).clamp(1, 5),
        })
        .await
}

// ── Embedded MPV (native child window) ──────────────────────────────────────

use crate::mpv::{ParentHandle, PlayerRect};

#[tauri::command]
pub async fn embed_attach(state: State<'_, Arc<AppState>>, window: tauri::Window) -> AppResult<()> {
    let parent = native_parent_handle(&window)?;
    state.mpv.bind_embedded(parent)
}

#[tauri::command]
pub async fn embed_set_rect(state: State<'_, Arc<AppState>>, rect: PlayerRect) -> AppResult<()> {
    state.mpv.embed_rect(rect)
}

#[tauri::command]
pub async fn embed_set_visible(state: State<'_, Arc<AppState>>, visible: bool) -> AppResult<()> {
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

fn parse_argument_template(input: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut escaped = false;

    for ch in input.chars() {
        if escaped {
            current.push(ch);
            escaped = false;
            continue;
        }
        if ch == '\\' {
            escaped = true;
            continue;
        }
        if (ch == '"' || ch == '\'') && quote.map_or(true, |q| q == ch) {
            quote = if quote.is_some() { None } else { Some(ch) };
            continue;
        }
        if quote.is_none() && ch.is_whitespace() {
            if !current.is_empty() {
                args.push(std::mem::take(&mut current));
            }
            continue;
        }
        current.push(ch);
    }
    if escaped {
        current.push('\\');
    }
    if !current.is_empty() {
        args.push(current);
    }
    args
}

fn mpv_header_args(headers: &[(String, String)]) -> Vec<String> {
    let fields = headers
        .iter()
        .filter(|(key, value)| !key.is_empty() && !value.is_empty())
        .map(|(key, value)| format!("{key}: {value}"))
        .collect::<Vec<_>>();
    if fields.is_empty() {
        Vec::new()
    } else {
        vec![format!("--http-header-fields={}", fields.join(","))]
    }
}

fn looks_like_mpv(player_path: &str) -> bool {
    Path::new(player_path)
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| {
            let name = name.to_ascii_lowercase();
            name == "mpv" || name == "mpv.exe"
        })
        .unwrap_or(false)
}

fn build_external_player_args(
    template: &str,
    player_path: &str,
    url: &str,
    title: &str,
    user_agent: Option<&str>,
    headers: &[(String, String)],
    start_ms: i64,
) -> Vec<String> {
    let header_args = mpv_header_args(headers);
    let start_ms = start_ms.max(0);
    let start_seconds = start_ms as f64 / 1000.0;
    let template = template.trim();
    if template.is_empty() {
        if looks_like_mpv(player_path) {
            let mut args = vec![format!("--force-media-title={title}")];
            if start_seconds > 0.0 {
                args.push(format!("--start={start_seconds:.3}"));
            }
            if let Some(ua) = user_agent.filter(|ua| !ua.is_empty()) {
                args.push(format!("--user-agent={ua}"));
            }
            args.extend(header_args);
            args.push(url.to_string());
            return args;
        }
        return vec![url.to_string()];
    }

    parse_argument_template(template)
        .into_iter()
        .flat_map(|arg| {
            if arg == "{headers}" {
                return header_args.clone();
            }
            vec![arg
                .replace("{url}", url)
                .replace("{title}", title)
                .replace("{userAgent}", user_agent.unwrap_or_default())
                .replace("{startMs}", &start_ms.to_string())
                .replace("{startSeconds}", &format!("{start_seconds:.3}"))]
        })
        .collect()
}

#[tauri::command]
pub async fn open_external(url: String) -> AppResult<()> {
    open::that(&url).map_err(|e| AppError::Other(format!("open url: {e}")))?;
    Ok(())
}

#[tauri::command]
pub async fn open_path(path: String) -> AppResult<()> {
    open::that(&path).map_err(|e| AppError::Other(format!("open path: {e}")))?;
    Ok(())
}

#[tauri::command]
pub async fn set_always_on_top(window: tauri::Window, enabled: bool) -> AppResult<()> {
    window
        .set_always_on_top(enabled)
        .map_err(|e| AppError::Other(format!("set always on top: {e}")))?;
    Ok(())
}

#[tauri::command]
pub async fn set_secondary_display_blackout(
    app: tauri::AppHandle,
    window: tauri::Window,
    enabled: bool,
) -> AppResult<SecondaryDisplayBlackoutResult> {
    close_secondary_blackout_windows(&app);
    if !enabled {
        return Ok(SecondaryDisplayBlackoutResult { count: 0 });
    }

    let active_monitor = window
        .current_monitor()
        .map_err(|e| AppError::Other(format!("current monitor: {e}")))?;
    let monitors = window
        .available_monitors()
        .map_err(|e| AppError::Other(format!("available monitors: {e}")))?;
    let mut count = 0usize;

    for (index, monitor) in monitors.into_iter().enumerate() {
        let is_active = active_monitor.as_ref().is_some_and(|active| {
            active.position() == monitor.position() && active.size() == monitor.size()
        });
        if is_active {
            continue;
        }

        let position = monitor.position();
        let size = monitor.size();
        let label = format!(
            "{SECONDARY_BLACKOUT_LABEL_PREFIX}{index}-{}",
            Uuid::new_v4().simple()
        );
        WebviewWindowBuilder::new(&app, label, WebviewUrl::App("blackout.html".into()))
            .title("Hills Lite Blackout")
            .decorations(false)
            .resizable(false)
            .fullscreen(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .shadow(false)
            .focused(false)
            .focusable(false)
            .position(position.x as f64, position.y as f64)
            .inner_size(size.width as f64, size.height as f64)
            .build()
            .map_err(|e| AppError::Other(format!("create blackout window: {e}")))?;
        count += 1;
    }

    Ok(SecondaryDisplayBlackoutResult { count })
}
