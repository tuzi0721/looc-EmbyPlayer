use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Arc,
    time::Duration,
};

use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};
use url::Url;
use uuid::Uuid;

use crate::config::models::{Account, Anime4kMode, Line, LineStatus, Server};
use crate::emby::models::{MediaItem, MediaSource, MediaStream, PlaybackInfo};
use crate::emby::{run_external_reporter, ExternalPlaybackReporter};
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
    pub range_supported: Option<bool>,
    pub start_suppressed_non_seekable: bool,
    pub stream_url: String,
    pub duration_ms: Option<i64>,
    pub tracks: Vec<MpvTrackInfo>,
    pub media_sources: Vec<PlaybackMediaSourceResult>,
    pub lines: Vec<PlaybackLineOptionResult>,
    pub headers: Vec<(String, String)>,
    pub user_agent: Option<String>,
    pub diagnostics: serde_json::Value,
    /// When true, the source is a Range-broken / non-faststart MP4 that cannot
    /// be streamed directly. The backend has started caching it to a local file
    /// (see `get_prefetch_state`); the player should show download progress and
    /// then play the cached local file once it is ready.
    #[serde(default)]
    pub prefetching: bool,
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
const RANGE_BROKEN_MP4_ERROR: &str = "无法本机直连播放：这个 MP4/MOV 源所在服务器不支持 HTTP Range，且文件开头没有可流式播放的索引。Hills Lite 已阻止黑屏起播，并且不会请求服务器解码/转码。请先下载到本地后播放，或换一个支持 Range/已 faststart 处理的媒体源或线路。";
const STREAM_PROBE_ERROR: &str = "无法本机直连播放：播放流连接或 Range 探测失败。Hills Lite 已阻止继续进入黑屏起播，并且不会请求服务器解码/转码。请稍后重试、切换线路，或先下载到本地后播放。";
const MPV_READY_ERROR: &str = "无法本机直连播放：mpv 已接收到播放流，但没有在本机解析出可播放的媒体轨道。Hills Lite 已阻止黑屏起播，并且不会请求服务器解码/转码。请切换支持 HTTP Range 的线路，或先下载到本地后播放。";

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

struct PlaybackLineSelection {
    line: Line,
    url: Url,
    headers: Vec<(String, String)>,
    user_agent: Option<String>,
    range_supported: bool,
}

struct PlaybackLineChoice {
    selected: PlaybackLineSelection,
    fallbacks: Vec<PlaybackLineSelection>,
}

/// Outcome of choosing how to play a source.
enum PlaybackPlan {
    /// A line can be streamed directly into mpv (seekable, or non-seekable but
    /// streamable). The normal load path applies.
    Stream(PlaybackLineChoice),
    /// The source is a Range-broken, non-faststart MP4/MOV: it cannot be
    /// streamed. The backend must cache it to a local file first, then play the
    /// local file. Carries the best line to download from.
    CacheThenLocal(PlaybackLineSelection),
}

struct ReadyPlaybackLine {
    selection: PlaybackLineSelection,
    mpv_url: String,
    effective_mpv_start_ms: Option<i64>,
    start_suppressed_nonseekable: bool,
    start_fallback_zero: bool,
}

fn playback_line_candidates(server: &Server, line_id: Option<&str>) -> AppResult<Vec<Line>> {
    if let Some(id) = line_id.filter(|id| !id.trim().is_empty()) {
        let line = server
            .lines
            .iter()
            .find(|line| line.id == id)
            .ok_or_else(|| AppError::NotFound(format!("line {id}")))?;
        if !line.enabled {
            return Err(AppError::NoLine(server.id.clone()));
        }
        return Ok(vec![line.clone()]);
    }

    let mut candidates: Vec<Line> = Vec::new();
    if let Some(active_id) = &server.active_line_id {
        if let Some(line) = server
            .lines
            .iter()
            .find(|line| &line.id == active_id && line.enabled)
        {
            candidates.push(line.clone());
        }
    }

    let mut alive: Vec<&Line> = server
        .lines
        .iter()
        .filter(|line| line.enabled && line.last_status != Some(LineStatus::Down))
        .collect();
    alive.sort_by_key(|line| (line.priority, line.last_latency_ms.unwrap_or(u32::MAX)));

    for line in alive {
        if candidates.iter().any(|candidate| candidate.id == line.id) {
            continue;
        }
        candidates.push(line.clone());
    }

    if candidates.is_empty() {
        return Err(AppError::NoLine(server.id.clone()));
    }
    Ok(candidates)
}

fn playback_headers_for_line(
    server: &Server,
    account: &Account,
    line: &Line,
) -> (Option<String>, Vec<(String, String)>) {
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
    (user_agent, headers)
}

/// Ordered candidate stream URLs to probe for a line. Emby/Jellyfin servers
/// differ in how they expose the stream (root vs `/emby/` subfolder vs a custom
/// base), and reverse proxies often only pass HTTP Range under one location.
/// We therefore probe, in order:
///   1. the server-provided `DirectStreamUrl` (authoritative per Emby's
///      Playback Guidelines), and its `/emby` variant,
///   2. our synthesized `/Videos/{id}/stream.ext`, and its `/emby` variant,
/// then pick the first candidate that returns `206` (skipping `404`/errors).
fn stream_url_candidates(
    primary: &Url,
    source: &MediaSource,
    base_url: &str,
    access_token: &str,
) -> Vec<Url> {
    let mut out: Vec<Url> = Vec::new();
    let mut push = |url: Url| {
        if !out.iter().any(|existing| existing.as_str() == url.as_str()) {
            out.push(url);
        }
    };

    if let Some(direct) = source
        .direct_stream_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if let Some(url) = prepare_direct_stream_url(
            base_url,
            direct,
            source.add_api_key_to_direct_stream_url,
            access_token,
        ) {
            if let Some(emby) = with_emby_prefix(&url) {
                push(url.clone());
                push(emby);
            } else {
                push(url);
            }
        }
    }

    if let Some(emby) = with_emby_prefix(primary) {
        push(primary.clone());
        push(emby);
    } else {
        push(primary.clone());
    }

    out
}

/// Resolve a `DirectStreamUrl` (absolute or relative to the line base) and add
/// the api key when the server asks for it (`AddApiKeyToDirectStreamUrl`, or by
/// default when no token is present in the URL).
fn prepare_direct_stream_url(
    base_url: &str,
    direct: &str,
    add_api_key: Option<bool>,
    access_token: &str,
) -> Option<Url> {
    let mut url = match Url::parse(direct) {
        Ok(url) => url,
        Err(_) => Url::parse(base_url).ok()?.join(direct).ok()?,
    };
    let has_token = url.query_pairs().any(|(key, _)| {
        key.eq_ignore_ascii_case("api_key") || key.eq_ignore_ascii_case("x-emby-token")
    });
    let wants_key = add_api_key.unwrap_or(true) && !has_token && !access_token.is_empty();
    if wants_key {
        url.query_pairs_mut().append_pair("api_key", access_token);
    }
    Some(url)
}

fn with_emby_prefix(url: &Url) -> Option<Url> {
    let path = url.path();
    if path == "/emby" || path.starts_with("/emby/") {
        return None;
    }
    let trimmed = path.strip_prefix('/').unwrap_or(path);
    let mut next = url.clone();
    next.set_path(&format!("/emby/{trimmed}"));
    Some(next)
}

async fn select_playback_line(
    state: &AppState,
    server: &Server,
    account: &Account,
    item: &MediaItem,
    source: &MediaSource,
    play_session_id: &str,
    prefer_direct: bool,
    line_id: Option<&str>,
) -> AppResult<PlaybackPlan> {
    let candidates = playback_line_candidates(server, line_id)?;
    let mut seekable: Vec<PlaybackLineSelection> = Vec::new();
    let mut nonseekable: Vec<PlaybackLineSelection> = Vec::new();
    let mut range_broken: Vec<PlaybackLineSelection> = Vec::new();
    let mut saw_range_probe_error = false;
    let mut saw_range_broken_mp4 = false;

    for line in candidates {
        let primary = state.emby.build_stream_url_for_line(
            server,
            account,
            item,
            source,
            play_session_id,
            prefer_direct,
            Some(&line.id),
        )?;
        let (user_agent, headers) = playback_headers_for_line(server, account, &line);
        let url_candidates =
            stream_url_candidates(&primary, source, &line.base_url, &account.access_token);

        // Per-line: try each candidate URL (configured path + `/emby` variant).
        // Reverse proxies sometimes only pass HTTP Range / disable buffering on
        // the `/emby/` location, so the bare path returns `200` (no Range) or a
        // `404`. Prefer a `206` candidate; skip `404`/error candidates.
        let mut seekable_url: Option<Url> = None;
        let mut nonseekable_url: Option<Url> = None;
        let mut range_broken_url: Option<Url> = None;
        for cand in url_candidates {
            log_visual_player_stage(&format!(
                "play:range-probe-line-start id={} path={}",
                line.id,
                cand.path()
            ));
            let (status, range_supported) = match state
                .stream_proxy
                .probe_range_support(cand.clone(), headers.clone(), user_agent.clone())
                .await
            {
                Ok(result) => result,
                Err(error) => {
                    saw_range_probe_error = true;
                    log_visual_player_stage(&format!(
                        "play:range-probe-line-error id={} {}",
                        line.id,
                        sanitize_visual_error(&error.to_string())
                    ));
                    continue;
                }
            };
            log_visual_player_stage(&format!(
                "play:range-probe-line-complete id={} status={status} supported={range_supported} path={}",
                line.id,
                cand.path()
            ));

            if status >= 400 {
                // Wrong path / not found on this candidate; try the next one.
                continue;
            }
            if range_supported {
                seekable_url = Some(cand);
                break;
            }
            // 2xx without Range. For MP4/MOV, only usable if the prefix is
            // streamable (faststart); otherwise it is a cache-then-local source.
            if source_requires_streamable_mp4_prefix(source) {
                log_visual_player_stage(&format!("play:mp4-prefix-probe-start id={}", line.id));
                let streamable_prefix = match state
                    .stream_proxy
                    .probe_mp4_streamable_prefix(cand.clone(), headers.clone(), user_agent.clone())
                    .await
                {
                    Ok(streamable) => streamable,
                    Err(error) => {
                        log_visual_player_stage(&format!(
                            "play:mp4-prefix-probe-error id={} {}",
                            line.id,
                            sanitize_visual_error(&error.to_string())
                        ));
                        false
                    }
                };
                log_visual_player_stage(&format!(
                    "play:mp4-prefix-probe id={} streamable={streamable_prefix}",
                    line.id
                ));
                if streamable_prefix {
                    if nonseekable_url.is_none() {
                        nonseekable_url = Some(cand);
                    }
                } else if range_broken_url.is_none() {
                    range_broken_url = Some(cand);
                }
            } else if nonseekable_url.is_none() {
                nonseekable_url = Some(cand);
            }
        }

        if let Some(url) = seekable_url {
            log_visual_player_stage(&format!(
                "play:range-probe-candidate id={} supported=true",
                line.id
            ));
            seekable.push(PlaybackLineSelection {
                line,
                url,
                headers,
                user_agent,
                range_supported: true,
            });
        } else if let Some(url) = nonseekable_url {
            nonseekable.push(PlaybackLineSelection {
                line,
                url,
                headers,
                user_agent,
                range_supported: false,
            });
        } else if let Some(url) = range_broken_url {
            saw_range_broken_mp4 = true;
            range_broken.push(PlaybackLineSelection {
                line,
                url,
                headers,
                user_agent,
                range_supported: false,
            });
        }
    }

    if !seekable.is_empty() {
        let mut seekable = seekable.into_iter();
        let selection = seekable
            .next()
            .expect("seekable candidates checked as non-empty");
        let mut fallbacks: Vec<PlaybackLineSelection> = seekable.collect();
        fallbacks.extend(nonseekable);
        log_visual_player_stage(&format!(
            "play:range-probe-selected id={} supported=true fallbacks={}",
            selection.line.id,
            fallbacks.len()
        ));
        return Ok(PlaybackPlan::Stream(PlaybackLineChoice {
            selected: selection,
            fallbacks,
        }));
    }

    nonseekable.sort_by_key(|selection| {
        (
            selection.line.priority,
            selection.line.last_latency_ms.unwrap_or(u32::MAX),
        )
    });
    let mut nonseekable = nonseekable.into_iter();
    if let Some(selection) = nonseekable.next() {
        log_visual_player_stage(&format!(
            "play:range-probe-selected id={} supported=false fallbacks={}",
            selection.line.id,
            nonseekable.len()
        ));
        return Ok(PlaybackPlan::Stream(PlaybackLineChoice {
            selected: selection,
            fallbacks: nonseekable.collect(),
        }));
    }

    if saw_range_broken_mp4 {
        // Range-broken + non-faststart MP4/MOV: cannot stream. Cache to a local
        // file first, then play the local copy (which is seekable on disk).
        range_broken.sort_by_key(|selection| {
            (
                selection.line.priority,
                selection.line.last_latency_ms.unwrap_or(u32::MAX),
            )
        });
        if let Some(selection) = range_broken.into_iter().next() {
            log_visual_player_stage(&format!("play:cache-then-local id={}", selection.line.id));
            tracing::info!(
                target = "player",
                line_id = %selection.line.id,
                "range-broken non-faststart MP4: caching to local file then playing"
            );
            return Ok(PlaybackPlan::CacheThenLocal(selection));
        }
        log_visual_player_stage("play:blocked-range-broken-mp4");
        return Err(AppError::InvalidState(RANGE_BROKEN_MP4_ERROR.into()));
    }
    if saw_range_probe_error {
        return Err(AppError::InvalidState(STREAM_PROBE_ERROR.into()));
    }
    Err(AppError::InvalidState(STREAM_PROBE_ERROR.into()))
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
    let source = pick_local_media_source(
        &pb,
        payload.media_source_id.as_deref(),
        state.config.settings().preferred_version_strategy,
    )?;
    let play_method = source.local_decode_play_method().to_string();
    let line = state.emby.pick_line(&server, line_id)?;
    let url = state.emby.build_stream_url_for_line(
        &server,
        &account,
        &item,
        &source,
        &pb.play_session_id,
        true,
        Some(&line.id),
    )?;
    let (user_agent, headers) = playback_headers_for_line(&server, &account, &line);
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
        range_supported: None,
        start_suppressed_non_seekable: false,
        stream_url: proxy_url,
        duration_ms,
        tracks,
        media_sources,
        lines,
        headers: Vec::new(),
        user_agent: None,
        diagnostics,
        prefetching: false,
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
        None => crate::emby::models::pick_preferred_local_source(
            &pb.media_sources,
            state.config.settings().preferred_version_strategy,
        )
        .ok_or_else(|| {
            AppError::InvalidState(
                "已阻止播放：服务端没有返回可本机直连或本机直流的媒体源。Hills Lite 不允许服务端解码/转码，以避免压垮 NAS、路由器或 VPS。".into(),
            )
        })?
        .clone(),
    };
    log_visual_player_stage("play:source-selected");

    let line_choice = match select_playback_line(
        &state,
        &server,
        &account,
        &item,
        &source,
        &pb.play_session_id,
        payload.prefer_direct,
        line_id,
    )
    .await?
    {
        PlaybackPlan::Stream(choice) => choice,
        PlaybackPlan::CacheThenLocal(selection) => {
            return start_prefetch_result(&state, &server, &item, &pb, &source, selection).await;
        }
    };
    log_visual_player_stage("play:stream-url-ready");
    let play_method = source.local_decode_play_method().to_string();
    let tracks = source.media_streams.iter().map(stream_to_track).collect();
    let media_sources = pb
        .media_sources
        .iter()
        .enumerate()
        .map(|(index, candidate)| media_source_result(candidate, index, &source.id))
        .collect();

    let requested_start_ms = payload.start_ms;
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
        Some(path.to_string_lossy().to_string())
    } else {
        None
    };

    let backend = state.mpv.backend();
    let ready_line = load_ready_playback_line(
        &state,
        &backend,
        line_choice,
        requested_start_ms,
        stream_record_path.clone(),
    )
    .await?;
    let ReadyPlaybackLine {
        selection:
            PlaybackLineSelection {
                line,
                url,
                range_supported,
                ..
            },
        mpv_url,
        effective_mpv_start_ms,
        start_suppressed_nonseekable,
        start_fallback_zero,
    } = ready_line;

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

    let mut record_task_id: Option<String> = None;
    if let Some(path_str) = stream_record_path.clone() {
        let mut task = crate::download::DownloadTask::new(crate::download::DownloadTaskRequest {
            server_id: server.id.clone(),
            account_id: account.id.clone(),
            item_id: item.id.clone(),
            media_source_id: source.id.clone(),
            play_session_id: pb.play_session_id.clone(),
            title: item.name.clone(),
            file_path: path_str,
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
        let task_id = task.id.clone();
        if let Err(error) = state.config.upsert_download(task) {
            log_visual_player_stage(&format!(
                "play:record-task-error {}",
                sanitize_visual_error(&error.to_string())
            ));
            let _ = backend.execute(MpvCommand::Stop).await;
            return Err(error);
        }
        record_task_id = Some(task_id);
    }

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
        "rangeSupported": range_supported,
        "requestedStartMs": requested_start_ms,
        "mpvStartMs": effective_mpv_start_ms,
        "startSuppressedNonSeekable": start_suppressed_nonseekable,
        "startFallbackZero": start_fallback_zero,
    });

    let result = PlaybackSourceResult {
        item_id,
        play_session_id,
        media_source_id: source.id.clone(),
        play_method,
        line_id: line.id.clone(),
        line_name: line.name.clone(),
        range_supported: Some(range_supported),
        start_suppressed_non_seekable: start_suppressed_nonseekable,
        stream_url: mpv_url,
        duration_ms,
        tracks,
        media_sources,
        lines,
        headers: Vec::new(),
        user_agent: None,
        diagnostics,
        prefetching: false,
    };
    log_visual_player_stage("play:return");
    Ok(result)
}

/// Range-broken / non-faststart MP4: start caching the source to a local file
/// and return a `prefetching` result. The frontend polls `get_prefetch_state`
/// and plays the local cache file via `play_file` once it is ready.
async fn start_prefetch_result(
    state: &AppState,
    server: &Server,
    item: &MediaItem,
    pb: &PlaybackInfo,
    source: &MediaSource,
    selection: PlaybackLineSelection,
) -> AppResult<PlaybackSourceResult> {
    let extension = source.container.clone().unwrap_or_else(|| "mp4".into());
    state.prefetch.start(
        &item.id,
        selection.url.clone(),
        selection.headers.clone(),
        selection.user_agent.clone(),
        &extension,
    )?;
    log_visual_player_stage("play:prefetch-start");

    // No live mpv session yet; the local file is loaded once caching completes.
    *state.current_play_session.lock().await = None;

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
            selected: candidate.id == selection.line.id,
        })
        .collect();
    let duration_ms = item.run_time_ticks.map(|ticks| (ticks / 10_000).max(0));
    let diagnostics = json!({
        "sourceKind": "cache-then-local",
        "streamKind": "local-cache",
        "serverTranscodingAllowed": false,
        "rangeBroken": true,
        "line": {
            "id": selection.line.id.clone(),
            "name": selection.line.name.clone(),
            "baseUrl": selection.line.base_url.clone(),
        },
    });

    Ok(PlaybackSourceResult {
        item_id: item.id.clone(),
        play_session_id: pb.play_session_id.clone(),
        media_source_id: source.id.clone(),
        play_method,
        line_id: selection.line.id.clone(),
        line_name: selection.line.name.clone(),
        range_supported: Some(true),
        start_suppressed_non_seekable: false,
        stream_url: String::new(),
        duration_ms,
        tracks,
        media_sources,
        lines,
        headers: Vec::new(),
        user_agent: None,
        diagnostics,
        prefetching: true,
    })
}

async fn load_ready_playback_line(
    state: &AppState,
    backend: &Arc<dyn MpvBackend>,
    choice: PlaybackLineChoice,
    requested_start_ms: Option<i64>,
    stream_record_path: Option<String>,
) -> AppResult<ReadyPlaybackLine> {
    let mut attempts = Vec::with_capacity(choice.fallbacks.len() + 1);
    attempts.push(choice.selected);
    attempts.extend(choice.fallbacks);

    let mut last_error: Option<AppError> = None;
    for (attempt_index, selection) in attempts.into_iter().enumerate() {
        let line_id = selection.line.id.clone();
        let range_supported = selection.range_supported;
        log_visual_player_stage(&format!(
            "play:mpv-line-attempt-start id={} attempt={} range={range_supported}",
            line_id,
            attempt_index + 1
        ));
        tracing::info!(
            target = "player",
            line_id = %line_id,
            attempt = attempt_index + 1,
            range_supported,
            "trying playback line"
        );

        let mpv_url = match state
            .stream_proxy
            .register_with_range_support(
                selection.url.clone(),
                selection.headers.clone(),
                selection.user_agent.clone(),
                range_supported,
            )
            .await
        {
            Ok(url) => url,
            Err(error) => {
                log_visual_player_stage(&format!(
                    "play:stream-proxy-line-error id={} {}",
                    line_id,
                    sanitize_visual_error(&error.to_string())
                ));
                last_error = Some(error);
                continue;
            }
        };
        log_visual_player_stage(&format!("play:stream-proxy-ready id={line_id}"));

        let start_suppressed_nonseekable =
            !range_supported && requested_start_ms.unwrap_or_default() > 0;
        let mut effective_mpv_start_ms = if start_suppressed_nonseekable {
            log_visual_player_stage(&format!(
                "play:start-suppressed-nonseekable id={} requested_ms={}",
                line_id,
                requested_start_ms.unwrap_or_default()
            ));
            tracing::info!(
                target = "player",
                line_id = %line_id,
                requested_start_ms = requested_start_ms.unwrap_or_default(),
                "suppressed resume start because selected line is not range-seekable"
            );
            None
        } else {
            requested_start_ms
        };

        log_visual_player_stage(&format!("play:mpv-stop-before-load-start id={line_id}"));
        if let Err(error) = backend.execute(MpvCommand::Stop).await {
            log_visual_player_stage(&format!(
                "play:mpv-stop-before-load-error id={} {}",
                line_id,
                sanitize_visual_error(&error.to_string())
            ));
            tracing::debug!(target = "player", error = %error, "mpv stop before load failed");
        } else {
            log_visual_player_stage(&format!("play:mpv-stop-before-load-complete id={line_id}"));
        }

        log_visual_player_stage(&format!("play:mpv-load-start id={line_id}"));
        if let Err(error) = backend
            .execute(MpvCommand::Load {
                url: mpv_url.clone(),
                headers: Vec::new(),
                user_agent: None,
                start_ms: effective_mpv_start_ms,
                http_seekable: Some(range_supported),
                stream_record_path: stream_record_path.clone(),
                autoload_subtitles: true,
            })
            .await
        {
            log_visual_player_stage(&format!(
                "play:mpv-load-error id={} {}",
                line_id,
                sanitize_visual_error(&error.to_string())
            ));
            let _ = backend.execute(MpvCommand::Stop).await;
            last_error = Some(error);
            continue;
        }
        log_visual_player_stage(&format!("play:mpv-load-complete id={line_id}"));
        if let Err(error) = apply_saved_anime4k_mode(state).await {
            tracing::warn!(target = "player", error = %error, "apply Anime4K preset after load failed");
        }
        log_visual_player_stage(&format!("play:mpv-ready-wait-start id={line_id}"));
        match wait_for_loaded_mpv_state(backend, Duration::from_secs(18)).await {
            Ok(_) => {
                log_visual_player_stage(&format!("play:mpv-ready-wait-complete id={line_id}"));
                return Ok(ReadyPlaybackLine {
                    selection,
                    mpv_url,
                    effective_mpv_start_ms,
                    start_suppressed_nonseekable,
                    start_fallback_zero: false,
                });
            }
            Err(error) if effective_mpv_start_ms.is_some() && stream_record_path.is_none() => {
                log_visual_player_stage(&format!(
                    "play:mpv-ready-wait-error id={} {}",
                    line_id,
                    sanitize_visual_error(&error.to_string())
                ));
                log_visual_player_stage(&format!("play:mpv-retry-zero-start id={line_id}"));
                let _ = backend.execute(MpvCommand::Stop).await;
                effective_mpv_start_ms = None;
                if let Err(retry_load_error) = backend
                    .execute(MpvCommand::Load {
                        url: mpv_url.clone(),
                        headers: Vec::new(),
                        user_agent: None,
                        start_ms: effective_mpv_start_ms,
                        http_seekable: Some(range_supported),
                        stream_record_path: None,
                        autoload_subtitles: true,
                    })
                    .await
                {
                    log_visual_player_stage(&format!(
                        "play:mpv-retry-zero-load-error id={} {}",
                        line_id,
                        sanitize_visual_error(&retry_load_error.to_string())
                    ));
                    let _ = backend.execute(MpvCommand::Stop).await;
                    last_error = Some(retry_load_error);
                    continue;
                }
                log_visual_player_stage(&format!("play:mpv-retry-zero-load-complete id={line_id}"));
                match wait_for_loaded_mpv_state(backend, Duration::from_secs(18)).await {
                    Ok(_) => {
                        log_visual_player_stage(&format!(
                            "play:mpv-retry-zero-complete id={line_id}"
                        ));
                        return Ok(ReadyPlaybackLine {
                            selection,
                            mpv_url,
                            effective_mpv_start_ms,
                            start_suppressed_nonseekable,
                            start_fallback_zero: true,
                        });
                    }
                    Err(retry_error) => {
                        log_visual_player_stage(&format!(
                            "play:mpv-retry-zero-error id={} {}",
                            line_id,
                            sanitize_visual_error(&retry_error.to_string())
                        ));
                        let _ = backend.execute(MpvCommand::Stop).await;
                        last_error = Some(retry_error);
                    }
                }
            }
            Err(error) => {
                log_visual_player_stage(&format!(
                    "play:mpv-ready-wait-error id={} {}",
                    line_id,
                    sanitize_visual_error(&error.to_string())
                ));
                let _ = backend.execute(MpvCommand::Stop).await;
                last_error = Some(error);
            }
        }

        log_visual_player_stage(&format!("play:mpv-line-attempt-failed id={line_id}"));
        tracing::warn!(
            target = "player",
            line_id = %line_id,
            attempt = attempt_index + 1,
            "playback line failed; failing over to next candidate line"
        );
    }

    Err(playback_ready_error(last_error.unwrap_or_else(|| {
        AppError::InvalidState("no playback line became ready".into())
    })))
}

async fn wait_for_loaded_mpv_state(
    backend: &Arc<dyn MpvBackend>,
    max_wait: Duration,
) -> AppResult<MpvSnapshot> {
    let deadline = tokio::time::Instant::now() + max_wait;
    let mut last_error: Option<String> = None;
    let mut last_unready: Option<String> = None;

    loop {
        match tokio::time::timeout(Duration::from_millis(1300), backend.snapshot()).await {
            Ok(Ok(snapshot)) => {
                if mpv_snapshot_has_media(&snapshot) {
                    return Ok(snapshot);
                }
                last_unready = Some(mpv_snapshot_unready_detail(&snapshot));
            }
            Ok(Err(error)) => {
                last_error = Some(error.to_string());
            }
            Err(_) => {
                last_error = Some("mpv state timed out".into());
            }
        }

        if tokio::time::Instant::now() >= deadline {
            break;
        }
        tokio::time::sleep(Duration::from_millis(450)).await;
    }

    let detail = last_unready
        .or(last_error)
        .unwrap_or_else(|| "no mpv state returned".into());
    Err(AppError::Mpv(format!(
        "mpv did not become ready after load: {detail}"
    )))
}

fn mpv_snapshot_has_media(snapshot: &MpvSnapshot) -> bool {
    let url_present = snapshot
        .url
        .as_deref()
        .is_some_and(|url| !url.trim().is_empty());
    let has_track = !snapshot.tracks.is_empty();
    let has_stream_shape = snapshot.duration_ms > 0
        || snapshot
            .video_codec
            .as_deref()
            .is_some_and(|value| !value.is_empty())
        || snapshot
            .audio_codec
            .as_deref()
            .is_some_and(|value| !value.is_empty())
        || snapshot.video_params.is_some()
        || snapshot.video_out_params.is_some()
        || snapshot.audio_params.is_some()
        || snapshot
            .demuxer
            .as_deref()
            .is_some_and(|value| !value.is_empty())
        || snapshot
            .file_format
            .as_deref()
            .is_some_and(|value| !value.is_empty());
    let not_idle = snapshot.idle_active != Some(true);
    url_present && not_idle && !snapshot.eof && (has_track || has_stream_shape)
}

fn mpv_snapshot_unready_detail(snapshot: &MpvSnapshot) -> String {
    format!(
        "urlPresent={} idle={} eof={} durationMs={} tracks={} videoCodec={} audioCodec={} demuxer={} format={}",
        snapshot
            .url
            .as_deref()
            .is_some_and(|url| !url.trim().is_empty()),
        snapshot
            .idle_active
            .map(|value| value.to_string())
            .unwrap_or_else(|| "unknown".into()),
        snapshot.eof,
        snapshot.duration_ms,
        snapshot.tracks.len(),
        snapshot.video_codec.as_deref().unwrap_or("none"),
        snapshot.audio_codec.as_deref().unwrap_or("none"),
        snapshot.demuxer.as_deref().unwrap_or("none"),
        snapshot.file_format.as_deref().unwrap_or("none"),
    )
}

fn playback_ready_error(error: AppError) -> AppError {
    AppError::InvalidState(format!(
        "{MPV_READY_ERROR}\n\n诊断：{}",
        strip_error_prefix(&error.to_string())
    ))
}

fn strip_error_prefix(message: &str) -> String {
    message
        .strip_prefix("mpv error: ")
        .or_else(|| message.strip_prefix("invalid state: "))
        .unwrap_or(message)
        .to_string()
}

fn pick_local_media_source(
    pb: &PlaybackInfo,
    media_source_id: Option<&str>,
    strategy: crate::config::models::PreferredVersionStrategy,
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
        None => crate::emby::models::pick_preferred_local_source(&pb.media_sources, strategy)
            .cloned()
            .ok_or_else(|| {
                AppError::InvalidState(
                    "已阻止播放：服务端没有返回可本机直连或本机直流的媒体源。Hills Lite 不允许服务端解码/转码，以避免压垮 NAS、路由器或 VPS。".into(),
                )
            }),
    }
}

fn source_requires_streamable_mp4_prefix(source: &MediaSource) -> bool {
    let Some(container) = source.container.as_deref() else {
        return false;
    };
    let ext = container
        .split(',')
        .next()
        .unwrap_or_default()
        .trim()
        .trim_start_matches('.')
        .to_ascii_lowercase();
    matches!(ext.as_str(), "mp4" | "m4v" | "mov")
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
    if let Err(error) = apply_saved_anime4k_mode(&state).await {
        tracing::warn!(target = "player", error = %error, "apply Anime4K preset after local load failed");
    }

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
        None => crate::emby::models::pick_preferred_local_source(
            &pb.media_sources,
            state.config.settings().preferred_version_strategy,
        )
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

    // Reference parity (HillsLite 设置·外部播放器): the explicit external mpv /
    // PotPlayer groups take precedence over the legacy generic external player.
    enum ExternalKind {
        Mpv,
        PotPlayer,
        Legacy,
    }
    fn configured_path(path: &Option<String>) -> Option<String> {
        path.as_deref()
            .map(str::trim)
            .filter(|p| !p.is_empty())
            .map(str::to_string)
    }
    let (player_path, kind) = if settings.external_mpv_enabled {
        match configured_path(&settings.external_mpv_path) {
            Some(p) => (p, ExternalKind::Mpv),
            None => {
                return Err(AppError::InvalidState(
                    "已开启外部 mpv 播放器，但未设置 mpv 位置。".into(),
                ))
            }
        }
    } else if settings.external_potplayer_enabled {
        match configured_path(&settings.external_potplayer_path) {
            Some(p) => (p, ExternalKind::PotPlayer),
            None => {
                return Err(AppError::InvalidState(
                    "已开启外部 PotPlayer 播放器，但未设置 PotPlayer 位置。".into(),
                ))
            }
        }
    } else if let Some(p) = configured_path(&settings.external_player_path) {
        (p, ExternalKind::Legacy)
    } else {
        open::that(url.as_str()).map_err(|e| AppError::Other(format!("open stream: {e}")))?;
        return Ok(());
    };
    let player_path = player_path.as_str();

    if !Path::new(player_path).exists() {
        return Err(AppError::Other(format!(
            "external player not found: {player_path}"
        )));
    }

    // Only mpv understands `--script`, so the reporter is injected (and stdout
    // captured) exclusively for mpv players. Anything else keeps the original
    // detached-launch behaviour.
    let treat_as_mpv = match kind {
        ExternalKind::Mpv => true,
        ExternalKind::PotPlayer => false,
        ExternalKind::Legacy => looks_like_mpv(player_path),
    };
    let reporter_script = if treat_as_mpv {
        crate::mpv::paths::resolve_reporter_script()
    } else {
        None
    };
    let args_template = match kind {
        ExternalKind::Legacy => settings.external_player_args.as_str(),
        _ => "",
    };
    let mut args = build_external_player_args(
        args_template,
        player_path,
        url.as_str(),
        payload.title.as_deref().unwrap_or(&item.name),
        user_agent.as_deref(),
        &headers,
        payload.start_ms.unwrap_or_default(),
        reporter_script.as_deref().and_then(Path::to_str),
    );
    match kind {
        ExternalKind::PotPlayer => {
            // PotPlayer CLI: `<url> /seek=hh:mm:ss`.
            args = vec![url.as_str().to_string()];
            let start_secs = payload.start_ms.unwrap_or_default() / 1000;
            if start_secs > 0 {
                args.push(format!(
                    "/seek={}:{:02}:{:02}",
                    start_secs / 3600,
                    (start_secs % 3600) / 60,
                    start_secs % 60
                ));
            }
        }
        ExternalKind::Mpv => {
            // "外部 mpv 使用系统代理": system-mode proxy env vars are inherited
            // by the child automatically; a custom proxy must be passed on.
            if settings.external_mpv_use_proxy
                && settings.network_proxy_mode == crate::config::models::NetworkProxyMode::Custom
            {
                let proxy = settings.http_proxy_url.trim();
                if !proxy.is_empty() && !args.is_empty() {
                    args.insert(args.len() - 1, format!("--http-proxy={proxy}"));
                }
            }
        }
        ExternalKind::Legacy => {}
    }

    if reporter_script.is_some() {
        // External mpv with the bundled reporter: capture stdout and bridge its
        // `HILLS_MPV_EVENT:` lines onto Emby session reporting. The reader task
        // is detached and never panics, so a crashing external mpv can't take
        // the app down; stdout EOF triggers a final Stopped report.
        let play_method = source.local_decode_play_method().to_string();
        let mut child = tokio::process::Command::new(player_path)
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| AppError::Other(format!("launch external player: {e}")))?;
        let stdout = child.stdout.take();
        let reporter = ExternalPlaybackReporter::new(
            state.emby.clone(),
            server.clone(),
            account.clone(),
            item.id.clone(),
            pb.play_session_id.clone(),
            play_method,
        );
        tokio::spawn(async move {
            if let Some(stdout) = stdout {
                run_external_reporter(tokio::io::BufReader::new(stdout), reporter).await;
            }
            let _ = child.wait().await;
        });
    } else {
        Command::new(player_path)
            .args(args)
            .spawn()
            .map_err(|e| AppError::Other(format!("launch external player: {e}")))?;
    }
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

/// Start playback in a standalone (independent-window) bundled-mpv process.
///
/// This is the T2 parallel mode: instead of embedding mpv into the WebView via
/// `--wid`, it launches the bundled mpv as its own top-level window with native
/// OSC controls, sidestepping the WebView z-order issues. Progress is reported
/// to Emby from the Rust side by parsing the mpv reporter on stdout (see
/// `crate::mpv::standalone`). It reuses the exact Direct Play / Direct Stream
/// source selection and local stream proxy as `play`, so no server-side
/// transcoding is ever involved.
#[tauri::command]
pub async fn play_standalone(
    state: State<'_, Arc<AppState>>,
    payload: PlayPayload,
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
    // Reuse the local-decode-only source picker; this both enforces
    // `supports_local_decode()` and blocks any transcoded source.
    let source = pick_local_media_source(
        &pb,
        payload.media_source_id.as_deref(),
        state.config.settings().preferred_version_strategy,
    )?;

    let choice = match select_playback_line(
        &state,
        &server,
        &account,
        &item,
        &source,
        &pb.play_session_id,
        payload.prefer_direct,
        line_id,
    )
    .await?
    {
        PlaybackPlan::Stream(choice) => choice,
        PlaybackPlan::CacheThenLocal(_) => {
            return Err(AppError::InvalidState(
                "此片源需要先缓存到本地再播放，独立窗口模式暂不支持，请改用常规播放。".into(),
            ));
        }
    };

    let selection = choice.selected;
    let range_supported = selection.range_supported;
    let mpv_url = state
        .stream_proxy
        .register_with_range_support(
            selection.url.clone(),
            selection.headers.clone(),
            selection.user_agent.clone(),
            range_supported,
        )
        .await?;

    // The independent window owns playback; stop the embedded backend so the
    // same item is not decoded twice.
    let _ = state.mpv.backend().execute(MpvCommand::Stop).await;

    let settings = state.config.settings();
    let play_method = source.local_decode_play_method().to_string();
    let start_ms = if range_supported {
        payload.start_ms
    } else {
        None
    };

    state
        .standalone
        .start(crate::mpv::StandaloneStartRequest {
            url: mpv_url.clone(),
            title: item.name.clone(),
            start_ms,
            audio_track: None,
            subtitle_track: None,
            sub_file: None,
            fullscreen: false,
            server: server.clone(),
            account: account.clone(),
            item_id: item.id.clone(),
            play_session_id: pb.play_session_id.clone(),
            play_method: play_method.clone(),
            volume: 100,
            hardware_decoding: settings.hardware_decoding,
            cache_mb: settings.mpv_cache_mb,
        })
        .await?;

    *state.current_play_session.lock().await = Some(CurrentPlaySession {
        server_id: server.id.clone(),
        account_id: account.id.clone(),
        item_id: item.id.clone(),
        play_session_id: pb.play_session_id.clone(),
        media_source_id: source.id.clone(),
        play_method: play_method.clone(),
        line_id: selection.line.id.clone(),
        record_task_id: None,
    });

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
            selected: candidate.id == selection.line.id,
        })
        .collect();
    let duration_ms = item.run_time_ticks.map(|ticks| (ticks / 10_000).max(0));
    let diagnostics = json!({
        "sourceKind": if source.supports_direct_play == Some(true) { "direct-play" } else { "direct-stream" },
        "streamKind": "standalone-window",
        "serverTranscodingAllowed": false,
        "rangeSupported": range_supported,
        "line": {
            "id": selection.line.id.clone(),
            "name": selection.line.name.clone(),
            "baseUrl": selection.line.base_url.clone(),
        },
    });

    Ok(PlaybackSourceResult {
        item_id: item.id.clone(),
        play_session_id: pb.play_session_id.clone(),
        media_source_id: source.id.clone(),
        play_method,
        line_id: selection.line.id.clone(),
        line_name: selection.line.name.clone(),
        range_supported: Some(range_supported),
        start_suppressed_non_seekable: !range_supported && payload.start_ms.unwrap_or_default() > 0,
        stream_url: mpv_url,
        duration_ms,
        tracks,
        media_sources,
        lines,
        headers: Vec::new(),
        user_agent: None,
        diagnostics,
        prefetching: false,
    })
}

/// Stop the standalone (independent-window) playback session, finalizing any
/// watch-while-download recording the same way `stop` does.
#[tauri::command]
pub async fn stop_standalone(state: State<'_, Arc<AppState>>) -> AppResult<()> {
    state.standalone.stop().await?;
    let session = state.current_play_session.lock().await.take();
    if let Some(s) = session {
        if let Some(task_id) = s.record_task_id {
            finalize_recording(&state, &task_id).await;
        }
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StandaloneControlPayload {
    /// One of: pause, resume, stop, seek, setVolume, setAudioTrack,
    /// setSubtitleTrack.
    pub action: String,
    #[serde(default)]
    pub position_ms: Option<i64>,
    #[serde(default)]
    pub volume: Option<i32>,
    #[serde(default)]
    pub track_id: Option<i64>,
}

/// Drive the standalone (independent-window) player over its control IPC so the
/// HTML overlay / Emby remote control can play/pause/seek/etc. without relying
/// only on the player's native OSC.
#[tauri::command]
pub async fn standalone_control(
    state: State<'_, Arc<AppState>>,
    payload: StandaloneControlPayload,
) -> AppResult<()> {
    use crate::mpv::StandaloneControl;
    let command = match payload.action.as_str() {
        "pause" => StandaloneControl::Pause,
        "resume" => StandaloneControl::Resume,
        "stop" => StandaloneControl::Stop,
        "seek" => StandaloneControl::Seek {
            position_ms: payload.position_ms.unwrap_or(0),
        },
        "setVolume" => StandaloneControl::SetVolume {
            volume: payload.volume.unwrap_or(100),
        },
        "setAudioTrack" => StandaloneControl::SetAudioTrack {
            id: payload
                .track_id
                .ok_or_else(|| AppError::InvalidState("setAudioTrack requires trackId".into()))?,
        },
        "setSubtitleTrack" => StandaloneControl::SetSubtitleTrack {
            id: payload.track_id,
        },
        other => {
            return Err(AppError::InvalidState(format!(
                "unknown standalone control action: {other}"
            )))
        }
    };
    state.standalone.control(command).await
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Anime4kModePayload {
    pub mode: Anime4kMode,
}

#[tauri::command]
pub async fn set_anime4k_mode(
    state: State<'_, Arc<AppState>>,
    payload: Anime4kModePayload,
) -> AppResult<()> {
    state.config.update_settings(|s| {
        s.anime4k_mode = payload.mode;
    })?;
    state
        .mpv
        .backend()
        .execute(MpvCommand::SetAnime4kMode(payload.mode))
        .await
}

async fn apply_saved_anime4k_mode(state: &AppState) -> AppResult<()> {
    let mode = state.config.settings().anime4k_mode;
    if mode == Anime4kMode::Off {
        return Ok(());
    }
    state
        .mpv
        .backend()
        .execute(MpvCommand::SetAnime4kMode(mode))
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
    let backend = state.mpv.backend();
    let snapshot = match tokio::time::timeout(
        std::time::Duration::from_millis(1100),
        backend.snapshot(),
    )
    .await
    {
        Ok(result) => result,
        Err(_) => Err(AppError::Mpv("mpv state timed out".into())),
    };
    log_visual_player_stage(if snapshot.is_ok() {
        "get_state:complete"
    } else if matches!(&snapshot, Err(AppError::Mpv(message)) if message.contains("timed out")) {
        "get_state:timeout"
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
    let result = match tokio::time::timeout(
        std::time::Duration::from_secs(8),
        state.mpv.bind_embedded(parent),
    )
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

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PointerProbe {
    /// The OS cursor moved since the previous poll (anywhere on screen).
    pub moved: bool,
    /// The cursor currently sits inside this window's outer bounds.
    pub inside: bool,
    /// The cursor sits inside the bottom strip of the window where the control
    /// bar lives. Used to keep controls pinned while the user reaches for / drags
    /// the progress bar, even when the cursor is momentarily still.
    pub near_bottom: bool,
}

/// Probes the OS cursor relative to this window. The embedded mpv native child
/// window sits above the WebView and swallows mouse events over the video area
/// (WebView2 does not reliably receive them through `HTTRANSPARENT`), so the
/// player polls this to (a) reveal its controls when the user moves the mouse
/// over the video and (b) keep them shown while the cursor hovers the bottom
/// control strip.
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn embed_pointer_probe(window: tauri::Window) -> PointerProbe {
    use std::sync::atomic::{AtomicI64, Ordering};
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

    static LAST: AtomicI64 = AtomicI64::new(i64::MIN);

    let mut point = POINT::default();
    if unsafe { GetCursorPos(&mut point) }.is_err() {
        return PointerProbe::default();
    }
    let packed = ((point.x as i64) << 32) | (point.y as i64 & 0xffff_ffff);
    let moved = LAST.swap(packed, Ordering::Relaxed) != packed;

    let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) else {
        return PointerProbe {
            moved,
            ..PointerProbe::default()
        };
    };
    let left = pos.x;
    let right = pos.x + size.width as i32;
    let top = pos.y;
    let bottom = pos.y + size.height as i32;
    let within_x = point.x >= left && point.x < right;
    let within_y = point.y >= top && point.y < bottom;
    let inside = within_x && within_y;

    // Bottom strip ~22% of the window height (min 120px) catches the control bar
    // area regardless of DPI scaling.
    let zone = ((size.height as f32 * 0.22) as i32).max(120);
    let near_bottom = inside && point.y >= bottom - zone;

    PointerProbe {
        moved,
        inside,
        near_bottom,
    }
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn embed_pointer_probe(_window: tauri::Window) -> PointerProbe {
    PointerProbe::default()
}

#[tauri::command]
pub async fn embed_set_visible(state: State<'_, Arc<AppState>>, visible: bool) -> AppResult<()> {
    log_visual_player_stage(if visible {
        "embed_visible:show"
    } else {
        "embed_visible:hide"
    });
    let mpv = state.mpv.clone();
    let timeout_ms = if visible { 4000 } else { 1500 };
    let result = match tokio::time::timeout(
        std::time::Duration::from_millis(timeout_ms),
        tokio::task::spawn_blocking(move || mpv.embed_show(visible)),
    )
    .await
    {
        Ok(joined) => joined
            .map_err(|error| AppError::Mpv(format!("embed visible worker failed: {error}")))?,
        Err(_) => Err(AppError::Mpv(if visible {
            "embed show timed out".into()
        } else {
            "embed hide timed out".into()
        })),
    };
    log_visual_player_stage(if result.is_ok() {
        "embed_visible:complete"
    } else if matches!(&result, Err(AppError::Mpv(message)) if message.contains("timed out")) {
        "embed_visible:timeout"
    } else {
        "embed_visible:error"
    });
    result
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
pub fn get_prefetch_state(state: State<'_, Arc<AppState>>) -> crate::mp4_prefetch::PrefetchState {
    state.prefetch.snapshot()
}

#[tauri::command]
pub fn cancel_prefetch(state: State<'_, Arc<AppState>>) {
    state.prefetch.cancel();
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
    reporter_script: Option<&str>,
) -> Vec<String> {
    let header_args = mpv_header_args(headers);
    let script_arg = reporter_script.map(|path| format!("--script={path}"));
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
            if let Some(script) = script_arg {
                args.push(script);
            }
            args.push(url.to_string());
            return args;
        }
        return vec![url.to_string()];
    }

    let mut args: Vec<String> = parse_argument_template(template)
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
        .collect();
    // Inject the reporter script for mpv-based custom templates so progress
    // reporting still works; the caller only supplies it for mpv players.
    if let Some(script) = script_arg {
        args.push(script);
    }
    args
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

/// Reference parity (HillsLite 设置·调试「编辑 mpv.conf」): make sure the
/// user-editable mpv.conf exists and return its path so the frontend can open
/// it in the system editor. The file is applied on the next mpv spawn.
#[tauri::command]
pub async fn ensure_mpv_conf() -> AppResult<String> {
    let path = crate::mpv::paths::resolve_user_mpv_conf()
        .ok_or_else(|| AppError::Other("cannot resolve mpv.conf location".into()))?;
    if !path.is_file() {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| AppError::Other(format!("create config dir: {e}")))?;
        }
        std::fs::write(
            &path,
            "# Hills Lite 用户 mpv.conf\n\
             # 此文件会以 --include 方式注入每次 mpv 启动，覆盖应用默认值。\n\
             # 示例：\n\
             # demuxer-max-bytes=512MiB\n\
             # sub-font-size=42\n",
        )
        .map_err(|e| AppError::Other(format!("create mpv.conf: {e}")))?;
    }
    Ok(path.display().to_string())
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
