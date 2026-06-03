use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
};

use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};
use uuid::Uuid;

use crate::emby::models::{MediaSource, MediaStream, PlaybackInfo};
use crate::error::{AppError, AppResult};
use crate::mpv::backend::MpvBackend;
use crate::mpv::backend::{MpvTrackInfo, TrackKind};
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
pub struct PlaybackSourcePayload {
    pub item_id: String,
    #[serde(default)]
    pub start_ms: Option<i64>,
    #[serde(default)]
    pub line_id: Option<String>,
    #[serde(default)]
    pub media_source_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackSourceResult {
    pub item_id: String,
    pub play_session_id: String,
    pub media_source_id: String,
    pub play_method: String,
    pub line_id: String,
    pub line_name: String,
    pub stream_url: String,
    pub duration_ms: Option<i64>,
    pub tracks: Vec<MpvTrackInfo>,
    pub media_sources: Vec<PlaybackMediaSourceResult>,
    pub lines: Vec<PlaybackLineOptionResult>,
    pub headers: Vec<(String, String)>,
    pub user_agent: Option<String>,
    pub diagnostics: serde_json::Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackMediaSourceResult {
    pub id: String,
    pub name: Option<String>,
    pub display_name: String,
    pub container: Option<String>,
    pub protocol: Option<String>,
    pub path: Option<String>,
    pub bitrate: Option<i64>,
    pub size: Option<i64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub audio_language: Option<String>,
    pub supports_direct_play: Option<bool>,
    pub supports_direct_stream: Option<bool>,
    pub play_method: Option<String>,
    pub supports_transcoding: Option<bool>,
    pub is_remote: Option<bool>,
    pub selected: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackLineOptionResult {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub enabled: bool,
    pub status: Option<crate::config::models::LineStatus>,
    pub latency_ms: Option<u32>,
    pub selected: bool,
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
    #[serde(default)]
    pub recursive: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalNfoMetadata {
    pub title: Option<String>,
    pub year: Option<u16>,
    pub overview: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFolderVideo {
    pub file_path: String,
    pub relative_path: String,
    pub name: String,
    pub extension: String,
    pub poster_path: Option<String>,
    pub poster_url: Option<String>,
    pub nfo_path: Option<String>,
    pub nfo: Option<LocalNfoMetadata>,
    pub sidecar_subtitle_count: usize,
    pub sidecar_danmaku_path: Option<String>,
    pub size_bytes: u64,
    pub modified_at_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFolderListing {
    pub directory: String,
    pub recursive: bool,
    pub truncated: bool,
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
const LOCAL_IMAGE_EXTENSIONS: &[(&str, usize)] = &[
    ("jpg", 0),
    ("jpeg", 1),
    ("png", 2),
    ("webp", 3),
    ("avif", 4),
    ("bmp", 5),
];
const FOLDER_POSTER_STEMS: &[&str] = &["poster", "cover", "folder"];
const MAX_LOCAL_FOLDER_VIDEOS: usize = 500;
const MAX_LOCAL_NFO_BYTES: u64 = 256 * 1024;

#[derive(Debug, Clone)]
struct LocalPosterCandidate {
    path: PathBuf,
    name: String,
    rank: usize,
}

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

fn log_visual_player_stage(msg: &str) {
    if std::env::var_os("HILLS_TAURI_CDP_PORT").is_none() {
        return;
    }
    let path = std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .or_else(|| {
            std::env::var_os("USERPROFILE")
                .map(std::path::PathBuf::from)
                .map(|p| p.join("AppData").join("Local"))
        })
        .unwrap_or_else(std::env::temp_dir);
    let dir = path.join("EmbyPlayer");
    let _ = std::fs::create_dir_all(&dir);
    let file = dir.join("visual-smoke.log");
    let when = chrono::Utc::now().to_rfc3339();
    let line = format!("{when} player {msg}\n");
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file)
        .and_then(|mut f| std::io::Write::write_all(&mut f, line.as_bytes()));
}

fn sanitize_visual_error(input: &str) -> String {
    let mut text = input.replace(['\r', '\n', '\t'], " ");
    if text.contains("://") {
        text = "[url]".into();
    }
    if text.len() > 180 {
        text.truncate(180);
        text.push_str("...");
    }
    text
}

fn close_secondary_blackout_windows(app: &tauri::AppHandle) {
    for (label, window) in app.webview_windows() {
        if label.starts_with(SECONDARY_BLACKOUT_LABEL_PREFIX) {
            let _ = window.close();
        }
    }
}

#[tauri::command]
pub async fn get_playback_source(
    state: State<'_, Arc<AppState>>,
    payload: PlaybackSourcePayload,
) -> AppResult<PlaybackSourceResult> {
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
    let source = pick_local_media_source(&pb, payload.media_source_id.as_deref())?;
    let play_method = source.local_decode_play_method().to_string();
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
    let proxy_url = state
        .stream_proxy
        .register(url.clone(), headers.clone(), user_agent.clone())
        .await?;
    let tracks = source.media_streams.iter().map(stream_to_track).collect();
    let media_sources = pb
        .media_sources
        .iter()
        .enumerate()
        .map(|(index, candidate)| media_source_result(candidate, index, &source.id))
        .collect();
    let lines = server
        .lines
        .iter()
        .map(|candidate| PlaybackLineOptionResult {
            id: candidate.id.clone(),
            name: candidate.name.clone(),
            base_url: candidate.base_url.clone(),
            enabled: candidate.enabled,
            status: candidate.last_status,
            latency_ms: candidate.last_latency_ms,
            selected: candidate.id == line.id,
        })
        .collect();

    let item_id = payload.item_id;
    let play_session_id = pb.play_session_id;
    let duration_ms = item.run_time_ticks.map(|ticks| (ticks / 10_000).max(0));
    let media_source_count = pb.media_sources.len();
    let diagnostics = json!({
        "sourceKind": if source.supports_direct_play == Some(true) { "direct-play" } else { "direct-stream" },
        "streamKind": "local-proxy",
        "mediaSourceCount": media_source_count,
        "serverTranscodingAllowed": false,
        "line": {
            "id": line.id.clone(),
            "name": line.name.clone(),
            "baseUrl": line.base_url.clone(),
        },
    });

    Ok(PlaybackSourceResult {
        item_id,
        play_session_id,
        media_source_id: source.id.clone(),
        play_method,
        line_id: line.id.clone(),
        line_name: line.name.clone(),
        stream_url: proxy_url,
        duration_ms,
        tracks,
        media_sources,
        lines,
        headers: Vec::new(),
        user_agent: None,
        diagnostics,
    })
}

#[tauri::command]
pub async fn play(
    state: State<'_, Arc<AppState>>,
    payload: PlayPayload,
) -> AppResult<PlaybackSourceResult> {
    log_visual_player_stage("play:start");
    let account = state
        .config
        .active_account()
        .ok_or_else(|| AppError::InvalidState("no active account".into()))?;
    log_visual_player_stage("play:active-account");
    let server = state
        .config
        .server(&account.server_id)
        .ok_or_else(|| AppError::NotFound(account.server_id.clone()))?;
    log_visual_player_stage("play:server-ready");

    let item = state
        .emby
        .get_item(&server, &account, &payload.item_id)
        .await?;
    log_visual_player_stage("play:item-ready");

    let start_ticks = payload.start_ms.map(|ms| ms * 10_000);
    let line_id = payload.line_id.as_deref();
    match state.emby.pick_line(&server, line_id) {
        Ok(line) => log_visual_player_stage(&format!(
            "play:playback-info-line id={} status={:?}",
            line.id, line.last_status
        )),
        Err(error) => log_visual_player_stage(&format!(
            "play:playback-info-line-error {}",
            sanitize_visual_error(&error.to_string())
        )),
    }
    log_visual_player_stage("play:playback-info-start");
    let pb = match state
        .emby
        .playback_info_for_line(&server, &account, &payload.item_id, start_ticks, line_id)
        .await
    {
        Ok(pb) => pb,
        Err(error) => {
            log_visual_player_stage(&format!(
                "play:playback-info-error {}",
                sanitize_visual_error(&error.to_string())
            ));
            return Err(error);
        }
    };
    log_visual_player_stage(&format!(
        "play:playback-info media_sources={}",
        pb.media_sources.len()
    ));
    let source = match payload.media_source_id.as_deref() {
        Some(id) => {
            let source = pb
                .media_sources
                .iter()
                .find(|source| source.id == id)
                .ok_or_else(|| AppError::InvalidState(format!("media source not found: {id}")))?;
            if !source.supports_local_decode() {
                return Err(AppError::InvalidState(
                    "已阻止播放：所选媒体源不支持本机直连或本机直流。Hills Lite 不允许服务端解码/转码，请换一个可本机解码的版本或线路。".into(),
                ));
            }
            source.clone()
        }
        None => pb
            .media_sources
            .iter()
            .find(|source| source.supports_local_decode())
            .ok_or_else(|| {
                AppError::InvalidState(
                    "已阻止播放：服务端没有返回可本机直连或本机直流的媒体源。Hills Lite 不允许服务端解码/转码，以避免压垮 NAS、路由器或 VPS。".into(),
                )
            })?
            .clone(),
    };
    log_visual_player_stage("play:source-selected");

    let url = state.emby.build_stream_url_for_line(
        &server,
        &account,
        &item,
        &source,
        &pb.play_session_id,
        payload.prefer_direct,
        line_id,
    )?;
    log_visual_player_stage("play:stream-url-ready");

    let line = state.emby.pick_line(&server, line_id)?;
    let play_method = source.local_decode_play_method().to_string();
    let tracks = source.media_streams.iter().map(stream_to_track).collect();
    let media_sources = pb
        .media_sources
        .iter()
        .enumerate()
        .map(|(index, candidate)| media_source_result(candidate, index, &source.id))
        .collect();
    let lines = server
        .lines
        .iter()
        .map(|candidate| PlaybackLineOptionResult {
            id: candidate.id.clone(),
            name: candidate.name.clone(),
            base_url: candidate.base_url.clone(),
            enabled: candidate.enabled,
            status: candidate.last_status,
            latency_ms: candidate.last_latency_ms,
            selected: candidate.id == line.id,
        })
        .collect();

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
    let range_supported = match state
        .stream_proxy
        .probe_range_support(url.clone(), headers.clone(), user_agent.clone())
        .await
    {
        Ok(supported) => supported,
        Err(error) => {
            log_visual_player_stage(&format!(
                "play:range-probe-error {}",
                sanitize_visual_error(&error.to_string())
            ));
            true
        }
    };
    log_visual_player_stage(&format!("play:range-probe supported={range_supported}"));
    let mpv_url = state
        .stream_proxy
        .register(url.clone(), headers.clone(), user_agent.clone())
        .await?;
    log_visual_player_stage("play:stream-proxy-ready");

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
    log_visual_player_stage("play:mpv-load-start");
    backend
        .execute(MpvCommand::Load {
            url: mpv_url.clone(),
            headers: Vec::new(),
            user_agent: None,
            start_ms: payload.start_ms,
            http_seekable: Some(range_supported),
            stream_record_path,
            autoload_subtitles: true,
        })
        .await?;
    log_visual_player_stage("play:mpv-load-complete");

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
    log_visual_player_stage("play:subtitle-style-complete");

    *state.current_play_session.lock().await = Some(CurrentPlaySession {
        server_id: server.id.clone(),
        account_id: account.id.clone(),
        item_id: item.id.clone(),
        play_session_id: pb.play_session_id.clone(),
        media_source_id: source.id.clone(),
        play_method: play_method.clone(),
        line_id: line.id.clone(),
        record_task_id,
    });
    log_visual_player_stage("play:session-stored");

    let duration_ms = item.run_time_ticks.map(|ticks| (ticks / 10_000).max(0));
    let item_id = item.id;
    let play_session_id = pb.play_session_id;
    let media_source_count = pb.media_sources.len();
    let diagnostics = json!({
        "sourceKind": if source.supports_direct_play == Some(true) { "direct-play" } else { "direct-stream" },
        "streamKind": "local-proxy",
        "mediaSourceCount": media_source_count,
        "serverTranscodingAllowed": false,
        "line": {
            "id": line.id.clone(),
            "name": line.name.clone(),
            "baseUrl": line.base_url.clone(),
        },
    });

    let result = PlaybackSourceResult {
        item_id,
        play_session_id,
        media_source_id: source.id.clone(),
        play_method,
        line_id: line.id.clone(),
        line_name: line.name.clone(),
        stream_url: mpv_url,
        duration_ms,
        tracks,
        media_sources,
        lines,
        headers: Vec::new(),
        user_agent: None,
        diagnostics,
    };
    log_visual_player_stage("play:return");
    Ok(result)
}

fn pick_local_media_source(
    pb: &PlaybackInfo,
    media_source_id: Option<&str>,
) -> AppResult<MediaSource> {
    match media_source_id.filter(|id| !id.trim().is_empty()) {
        Some(id) => {
            let source = pb
                .media_sources
                .iter()
                .find(|source| source.id == id)
                .ok_or_else(|| AppError::InvalidState(format!("media source not found: {id}")))?;
            if !source.supports_local_decode() {
                return Err(AppError::InvalidState(
                    "已阻止播放：所选媒体源不支持本机直连或本机直流。Hills Lite 不允许服务端解码/转码，请换一个可本机解码的版本或线路。".into(),
                ));
            }
            Ok(source.clone())
        }
        None => pb
            .media_sources
            .iter()
            .find(|source| source.supports_local_decode())
            .cloned()
            .ok_or_else(|| {
                AppError::InvalidState(
                    "已阻止播放：服务端没有返回可本机直连或本机直流的媒体源。Hills Lite 不允许服务端解码/转码，以避免压垮 NAS、路由器或 VPS。".into(),
                )
            }),
    }
}

fn stream_type(stream: &MediaStream) -> &str {
    stream.stream_type.as_deref().unwrap_or_default()
}

fn first_stream<'a>(source: &'a MediaSource, kind: &str) -> Option<&'a MediaStream> {
    source
        .media_streams
        .iter()
        .find(|stream| stream_type(stream).eq_ignore_ascii_case(kind))
}

fn stream_to_track(stream: &MediaStream) -> MpvTrackInfo {
    let kind = if stream_type(stream).eq_ignore_ascii_case("audio") {
        TrackKind::Audio
    } else if stream_type(stream).eq_ignore_ascii_case("subtitle") {
        TrackKind::Subtitle
    } else {
        TrackKind::Video
    };
    MpvTrackInfo {
        id: i64::from(stream.index),
        kind,
        title: stream
            .display_title
            .clone()
            .or_else(|| stream.title.clone()),
        lang: stream.language.clone(),
        codec: stream.codec.clone(),
        external: Some(stream.is_external),
        default_track: Some(stream.is_default),
        forced: Some(stream.is_forced),
        selected: stream.is_default,
    }
}

fn media_source_label(source: &MediaSource, index: usize) -> String {
    if let Some(path) = source.path.as_ref().filter(|path| !path.trim().is_empty()) {
        let file_name = path
            .replace('\\', "/")
            .split('/')
            .filter(|part| !part.is_empty())
            .last()
            .map(ToString::to_string);
        return file_name.unwrap_or_else(|| path.clone());
    }
    if source.id.trim().is_empty() {
        format!("媒体源 {}", index + 1)
    } else {
        format!("媒体源 {}", source.id)
    }
}

fn media_source_result(
    source: &MediaSource,
    index: usize,
    selected_id: &str,
) -> PlaybackMediaSourceResult {
    let video = first_stream(source, "video");
    let audio = first_stream(source, "audio");
    PlaybackMediaSourceResult {
        id: if source.id.trim().is_empty() {
            format!("source-{index}")
        } else {
            source.id.clone()
        },
        name: None,
        display_name: media_source_label(source, index),
        container: source.container.clone(),
        protocol: None,
        path: source.path.clone(),
        bitrate: source.bitrate,
        size: source.size,
        width: video.and_then(|stream| stream.width),
        height: video.and_then(|stream| stream.height),
        video_codec: video.and_then(|stream| stream.codec.clone()),
        audio_codec: audio.and_then(|stream| stream.codec.clone()),
        audio_language: audio.and_then(|stream| stream.language.clone()),
        supports_direct_play: source.supports_direct_play,
        supports_direct_stream: source.supports_direct_stream,
        play_method: source
            .supports_local_decode()
            .then(|| source.local_decode_play_method().to_string()),
        supports_transcoding: source.supports_transcoding,
        is_remote: None,
        selected: source.id == selected_id,
    }
}

fn sidecar_subtitle_ext_rank(ext: &str) -> Option<usize> {
    SIDECAR_SUBTITLE_EXTENSIONS
        .iter()
        .find_map(|(candidate, rank)| (*candidate == ext).then_some(*rank))
}

fn local_image_ext_rank(ext: &str) -> Option<usize> {
    LOCAL_IMAGE_EXTENSIONS
        .iter()
        .find_map(|(candidate, rank)| (*candidate == ext).then_some(*rank))
}

fn better_local_poster(
    current: Option<LocalPosterCandidate>,
    candidate: LocalPosterCandidate,
) -> LocalPosterCandidate {
    match current {
        Some(existing)
            if existing.rank < candidate.rank
                || (existing.rank == candidate.rank && existing.name <= candidate.name) =>
        {
            existing
        }
        _ => candidate,
    }
}

fn build_local_poster_index(
    entries: &[std::fs::DirEntry],
) -> (
    HashMap<String, LocalPosterCandidate>,
    Option<LocalPosterCandidate>,
) {
    let mut by_stem = HashMap::new();
    let mut folder_poster = None;

    for entry in entries {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(ext) = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
        else {
            continue;
        };
        let Some(rank) = local_image_ext_rank(&ext) else {
            continue;
        };
        let Some(stem) = path
            .file_stem()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        let candidate = LocalPosterCandidate {
            path,
            name: entry.file_name().to_string_lossy().to_ascii_lowercase(),
            rank,
        };
        let previous = by_stem.remove(&stem);
        by_stem.insert(
            stem.clone(),
            better_local_poster(previous, candidate.clone()),
        );
        if FOLDER_POSTER_STEMS.contains(&stem.as_str()) {
            folder_poster = Some(better_local_poster(folder_poster, candidate));
        }
    }

    (by_stem, folder_poster)
}

fn local_poster_url(path: &Path) -> Option<String> {
    url::Url::from_file_path(path)
        .ok()
        .map(|url| url.to_string())
}

fn build_local_nfo_index(entries: &[std::fs::DirEntry]) -> HashMap<String, PathBuf> {
    let mut by_stem: HashMap<String, (String, PathBuf)> = HashMap::new();

    for entry in entries {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(ext) = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
        else {
            continue;
        };
        if ext != "nfo" {
            continue;
        }
        let Some(stem) = path
            .file_stem()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        let should_replace = by_stem
            .get(&stem)
            .map(|(current_name, _)| name.as_str() < current_name.as_str())
            .unwrap_or(true);
        if should_replace {
            by_stem.insert(stem, (name, path));
        }
    }

    by_stem
        .into_iter()
        .map(|(stem, (_, path))| (stem, path))
        .collect()
}

fn decode_nfo_text(value: &str) -> Option<String> {
    let trimmed = value.trim();
    let text = if trimmed.starts_with("<![CDATA[") && trimmed.ends_with("]]>") {
        &trimmed[9..trimmed.len().saturating_sub(3)]
    } else {
        trimmed
    };
    let decoded = text
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&apos;", "'");
    let normalized = decoded.split_whitespace().collect::<Vec<_>>().join(" ");
    (!normalized.is_empty()).then_some(normalized)
}

fn extract_nfo_tag(content: &str, tag_name: &str) -> Option<String> {
    let lower = content.to_ascii_lowercase();
    let tag = tag_name.to_ascii_lowercase();
    let open_prefix = format!("<{tag}");
    let close_tag = format!("</{tag}>");
    let mut cursor = 0;

    while cursor < lower.len() {
        let open_start = lower[cursor..].find(&open_prefix)? + cursor;
        let after_name_index = open_start + tag.len() + 1;
        if let Some(after_name) = lower.as_bytes().get(after_name_index) {
            if !matches!(*after_name, b'>' | b'/' | b' ' | b'\t' | b'\r' | b'\n') {
                cursor = after_name_index;
                continue;
            }
        }
        let open_end = lower[open_start..].find('>')? + open_start;
        let close_start = lower[open_end + 1..].find(&close_tag)? + open_end + 1;
        return decode_nfo_text(&content[open_end + 1..close_start]);
    }

    None
}

fn year_from_nfo_value(value: Option<String>) -> Option<u16> {
    let value = value?;
    let bytes = value.as_bytes();
    if bytes.len() < 4 {
        return None;
    }
    for index in 0..=bytes.len() - 4 {
        let window = &bytes[index..index + 4];
        if !window.iter().all(|byte| byte.is_ascii_digit()) {
            continue;
        }
        if window.starts_with(b"19") || window.starts_with(b"20") {
            if let Ok(year) = value[index..index + 4].parse::<u16>() {
                return Some(year);
            }
        }
    }
    None
}

fn read_local_nfo(path: &Path) -> Option<LocalNfoMetadata> {
    let metadata = std::fs::metadata(path).ok()?;
    if !metadata.is_file() || metadata.len() > MAX_LOCAL_NFO_BYTES {
        return None;
    }
    let content = std::fs::read_to_string(path).ok()?;
    let title = extract_nfo_tag(&content, "title");
    let overview =
        extract_nfo_tag(&content, "plot").or_else(|| extract_nfo_tag(&content, "outline"));
    let year = year_from_nfo_value(extract_nfo_tag(&content, "year"))
        .or_else(|| year_from_nfo_value(extract_nfo_tag(&content, "premiered")))
        .or_else(|| year_from_nfo_value(extract_nfo_tag(&content, "releasedate")));
    if title.is_none() && overview.is_none() && year.is_none() {
        return None;
    }
    Some(LocalNfoMetadata {
        title,
        year,
        overview,
    })
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

fn count_sidecar_subtitles(video_stem: &str, entries: &[std::fs::DirEntry]) -> usize {
    entries
        .iter()
        .filter(|entry| entry.path().is_file())
        .filter_map(|entry| {
            let path = entry.path();
            let ext = path.extension()?.to_str()?.to_lowercase();
            sidecar_subtitle_ext_rank(&ext)?;
            let subtitle_stem = path.file_stem()?.to_str()?;
            sidecar_subtitle_rank(video_stem, subtitle_stem)
        })
        .take(8)
        .count()
}

fn find_sidecar_danmaku_path(video_stem: &str, entries: &[std::fs::DirEntry]) -> Option<PathBuf> {
    let by_name = entries
        .iter()
        .filter(|entry| entry.path().is_file())
        .filter_map(|entry| {
            Some((
                entry.file_name().to_string_lossy().to_ascii_lowercase(),
                entry.path(),
            ))
        })
        .collect::<HashMap<_, _>>();

    [
        format!("{video_stem}.xml"),
        format!("{video_stem}.danmaku.xml"),
        format!("{video_stem}.comments.xml"),
    ]
    .into_iter()
    .find_map(|candidate| by_name.get(&candidate.to_ascii_lowercase()).cloned())
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
            http_seekable: None,
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

    let recursive = payload.recursive;
    let mut items = Vec::new();
    let mut truncated = false;
    scan_local_folder_dir(
        &directory,
        &directory,
        recursive,
        &mut items,
        &mut truncated,
    )?;

    items.sort_by_key(|item| item.relative_path.to_ascii_lowercase());
    Ok(LocalFolderListing {
        directory: directory.to_string_lossy().to_string(),
        recursive,
        truncated,
        items,
    })
}

fn scan_local_folder_dir(
    root: &Path,
    directory: &Path,
    recursive: bool,
    items: &mut Vec<LocalFolderVideo>,
    truncated: &mut bool,
) -> AppResult<()> {
    if *truncated {
        return Ok(());
    }

    let entries = std::fs::read_dir(directory)
        .map_err(|error| AppError::InvalidState(format!("failed to read folder: {}", error)))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| {
            AppError::InvalidState(format!("failed to read folder item: {}", error))
        })?;
    let (poster_by_stem, folder_poster) = build_local_poster_index(&entries);
    let nfo_by_stem = build_local_nfo_index(&entries);

    for entry in &entries {
        if *truncated {
            break;
        }

        let path = entry.path();
        let file_type = entry.file_type().map_err(|error| {
            AppError::InvalidState(format!("failed to inspect folder item: {}", error))
        })?;

        if recursive && file_type.is_dir() {
            scan_local_folder_dir(root, &path, recursive, items, truncated)?;
            continue;
        }
        if !file_type.is_file() {
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
        if items.len() >= MAX_LOCAL_FOLDER_VIDEOS {
            *truncated = true;
            break;
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
        let relative_path = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();
        let stem = path
            .file_stem()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .unwrap_or_default();
        let poster_path = poster_by_stem
            .get(&stem)
            .or(folder_poster.as_ref())
            .map(|candidate| candidate.path.clone());
        let poster_path_string = poster_path
            .as_ref()
            .map(|path| path.to_string_lossy().to_string());
        let poster_url = poster_path.as_deref().and_then(local_poster_url);
        let nfo_path = nfo_by_stem.get(&stem).cloned();
        let nfo_path_string = nfo_path
            .as_ref()
            .map(|path| path.to_string_lossy().to_string());
        let nfo = nfo_path.as_deref().and_then(read_local_nfo);
        let sidecar_subtitle_count = count_sidecar_subtitles(&stem, &entries);
        let sidecar_danmaku_path = find_sidecar_danmaku_path(&stem, &entries)
            .map(|path| path.to_string_lossy().to_string());

        items.push(LocalFolderVideo {
            file_path: path.to_string_lossy().to_string(),
            relative_path,
            name,
            extension,
            poster_path: poster_path_string,
            poster_url,
            nfo_path: nfo_path_string,
            nfo,
            sidecar_subtitle_count,
            sidecar_danmaku_path,
            size_bytes: metadata.len(),
            modified_at_ms,
        });
    }

    Ok(())
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
        Some(id) => {
            let source = pb
                .media_sources
                .iter()
                .find(|source| source.id == id)
                .ok_or_else(|| AppError::InvalidState(format!("media source not found: {id}")))?;
            if !source.supports_local_decode() {
                return Err(AppError::InvalidState(
                    "已阻止播放：所选媒体源不支持本机直连或本机直流。Hills Lite 不允许服务端解码/转码，请换一个可本机解码的版本或线路。".into(),
                ));
            }
            source.clone()
        }
        None => pb
            .media_sources
            .iter()
            .find(|source| source.supports_local_decode())
            .ok_or_else(|| {
                AppError::InvalidState(
                    "已阻止播放：服务端没有返回可本机直连或本机直流的媒体源。Hills Lite 不允许服务端解码/转码，以避免压垮 NAS、路由器或 VPS。".into(),
                )
            })?
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeekRelativePayload {
    pub delta_ms: i64,
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

#[tauri::command]
pub async fn seek_relative(
    state: State<'_, Arc<AppState>>,
    payload: SeekRelativePayload,
) -> AppResult<()> {
    state
        .mpv
        .backend()
        .execute(MpvCommand::SeekRelative {
            delta_ms: payload.delta_ms,
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
    log_visual_player_stage("get_state:start");
    let snapshot = state.mpv.backend().snapshot().await;
    log_visual_player_stage(if snapshot.is_ok() {
        "get_state:complete"
    } else {
        "get_state:error"
    });
    snapshot
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbedState {
    pub mode: String,
    pub host_kind: String,
    pub runtime: String,
    pub hwnd: Option<String>,
    pub host_window_handle: Option<String>,
    pub attached_mpv_window_handle: Option<String>,
}

#[tauri::command]
pub async fn embed_attach(state: State<'_, Arc<AppState>>, window: tauri::Window) -> AppResult<()> {
    log_visual_player_stage("embed_attach:start");
    let parent = native_parent_handle(&window)?;
    log_visual_player_stage("embed_attach:parent-ready");
    log_visual_player_stage("embed_attach:bind-start");
    let result = match tokio::time::timeout(std::time::Duration::from_secs(8), async {
        state.mpv.bind_embedded(parent)
    })
    .await
    {
        Ok(result) => result,
        Err(_) => Err(AppError::Mpv("embed attach timed out".into())),
    };
    log_visual_player_stage(if result.is_ok() {
        "embed_attach:complete"
    } else if matches!(&result, Err(AppError::Mpv(message)) if message.contains("timed out")) {
        "embed_attach:timeout"
    } else {
        "embed_attach:error"
    });
    result
}

#[tauri::command]
pub async fn embed_set_rect(state: State<'_, Arc<AppState>>, rect: PlayerRect) -> AppResult<()> {
    state.mpv.embed_rect(rect)
}

#[tauri::command]
pub async fn embed_set_visible(state: State<'_, Arc<AppState>>, visible: bool) -> AppResult<()> {
    log_visual_player_stage(if visible {
        "embed_visible:show"
    } else {
        "embed_visible:hide"
    });
    state.mpv.embed_show(visible)
}

#[tauri::command]
pub async fn embed_detach(state: State<'_, Arc<AppState>>) -> AppResult<()> {
    log_visual_player_stage("embed_detach:start");
    let result = state.mpv.detach_embedded().await;
    log_visual_player_stage(if result.is_ok() {
        "embed_detach:complete"
    } else {
        "embed_detach:error"
    });
    result
}

#[tauri::command]
pub fn get_embed_state(state: State<'_, Arc<AppState>>, window: tauri::Window) -> EmbedState {
    EmbedState {
        mode: "wid".into(),
        host_kind: "native-child".into(),
        runtime: "tauri".into(),
        hwnd: state
            .mpv
            .embedded_window_handle()
            .map(|handle| handle.to_string()),
        host_window_handle: native_parent_handle(&window)
            .ok()
            .and_then(parent_handle_to_string),
        attached_mpv_window_handle: None,
    }
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

#[cfg(target_os = "windows")]
fn parent_handle_to_string(parent: ParentHandle) -> Option<String> {
    match parent {
        ParentHandle::Win32(handle) => Some(handle.to_string()),
        _ => None,
    }
}

#[cfg(not(target_os = "windows"))]
fn parent_handle_to_string(_parent: ParentHandle) -> Option<String> {
    None
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
pub async fn set_fullscreen(window: tauri::Window, enabled: bool) -> AppResult<bool> {
    window
        .set_fullscreen(enabled)
        .map_err(|e| AppError::Other(format!("set fullscreen: {e}")))?;
    Ok(window.is_fullscreen().unwrap_or(enabled))
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
