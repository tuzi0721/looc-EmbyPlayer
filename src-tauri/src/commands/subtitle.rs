//! Subtitle commands: list available subtitles for the current item (built-in
//! tracks reported by mpv + Emby-provided tracks), add external/sidecar
//! subtitle files, and adjust delay / scale.

use std::path::Path;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;
use url::Url;

use crate::emby::endpoints;
use crate::error::{AppError, AppResult};
use crate::mpv::MpvCommand;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbySubtitle {
    pub index: i32,
    pub language: Option<String>,
    pub display_title: Option<String>,
    pub codec: Option<String>,
    pub is_default: bool,
    pub is_forced: bool,
    pub is_external: bool,
    /// Absolute URL that mpv can pass to `sub-add`.
    pub url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleList {
    pub item_id: String,
    pub media_source_id: String,
    pub tracks: Vec<EmbySubtitle>,
}

/// Build the list of subtitle tracks the Emby server has for the active
/// session. Each track carries a streamable URL the player can hand to mpv.
#[tauri::command]
pub async fn list_subtitles(state: State<'_, Arc<AppState>>) -> AppResult<Option<SubtitleList>> {
    let Some(session) = state.current_play_session.lock().await.clone() else {
        return Ok(None);
    };

    let account = state
        .config
        .account(&session.account_id)
        .ok_or_else(|| AppError::NotFound(session.account_id.clone()))?;
    let server = state
        .config
        .server(&session.server_id)
        .ok_or_else(|| AppError::NotFound(session.server_id.clone()))?;

    let pb = state
        .emby
        .playback_info(&server, &account, &session.item_id, None)
        .await?;
    let mut sources = pb.media_sources;
    let source = if let Some(pos) = sources.iter().position(|s| s.id == session.media_source_id) {
        sources.swap_remove(pos)
    } else if let Some(first) = sources.into_iter().next() {
        first
    } else {
        return Ok(Some(SubtitleList {
            item_id: session.item_id,
            media_source_id: session.media_source_id,
            tracks: vec![],
        }));
    };

    let line = server
        .lines
        .iter()
        .find(|l| Some(&l.id) == server.active_line_id.as_ref())
        .or_else(|| server.lines.first())
        .cloned()
        .ok_or_else(|| AppError::NoLine(server.id.clone()))?;

    let mut tracks = vec![];
    for stream in source.media_streams {
        if stream.stream_type.as_deref() != Some("Subtitle") {
            continue;
        }
        let fmt = pick_format(stream.codec.as_deref());
        let url = if let Some(rel) = stream.delivery_url.as_deref() {
            absolute_url(&line.base_url, rel)?
        } else {
            endpoints::join(
                &line.base_url,
                &endpoints::subtitle_stream(
                    &session.item_id,
                    &session.media_source_id,
                    stream.index,
                    fmt,
                ),
            )?
        };
        let mut url = url;
        url.query_pairs_mut()
            .append_pair("api_key", &account.access_token);

        tracks.push(EmbySubtitle {
            index: stream.index,
            language: stream.language.clone(),
            display_title: stream
                .display_title
                .clone()
                .or_else(|| stream.title.clone()),
            codec: stream.codec.clone(),
            is_default: stream.is_default,
            is_forced: stream.is_forced,
            is_external: stream.is_external,
            url: url.to_string(),
        });
    }

    Ok(Some(SubtitleList {
        item_id: session.item_id,
        media_source_id: session.media_source_id,
        tracks,
    }))
}

fn pick_format(codec: Option<&str>) -> &'static str {
    match codec.map(|s| s.to_ascii_lowercase()).as_deref() {
        Some("ass") | Some("ssa") => "ass",
        Some("subrip") | Some("srt") => "srt",
        Some("webvtt") | Some("vtt") => "vtt",
        Some("pgs") | Some("pgssub") | Some("dvdsub") | Some("dvbsub") => "sup",
        _ => "srt",
    }
}

fn absolute_url(base: &str, rel: &str) -> AppResult<Url> {
    if rel.starts_with("http://") || rel.starts_with("https://") {
        Ok(Url::parse(rel)?)
    } else {
        endpoints::join(base, rel)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddSubtitlePayload {
    /// Either a local filesystem path or a URL (http(s)://).
    pub source: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub lang: Option<String>,
    #[serde(default = "default_true")]
    pub select: bool,
}

fn default_true() -> bool {
    true
}

#[tauri::command]
pub async fn add_subtitle(
    state: State<'_, Arc<AppState>>,
    payload: AddSubtitlePayload,
) -> AppResult<()> {
    let source = normalize_subtitle_source(&payload.source)?;
    state
        .mpv
        .backend()
        .execute(MpvCommand::AddSubtitle {
            source,
            title: payload.title,
            lang: payload.lang,
            select: payload.select,
        })
        .await
}

fn normalize_subtitle_source(s: &str) -> AppResult<String> {
    if s.starts_with("http://") || s.starts_with("https://") || s.starts_with("file://") {
        return Ok(s.to_string());
    }
    let p = Path::new(s);
    if p.exists() {
        return Ok(s.replace('\\', "/"));
    }
    Err(AppError::NotFound(format!("subtitle source: {s}")))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveSubtitlePayload {
    pub track_id: i64,
}

#[tauri::command]
pub async fn remove_subtitle(
    state: State<'_, Arc<AppState>>,
    payload: RemoveSubtitlePayload,
) -> AppResult<()> {
    state
        .mpv
        .backend()
        .execute(MpvCommand::RemoveSubtitle(payload.track_id))
        .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubDelayPayload {
    pub delay_ms: i64,
}

#[tauri::command]
pub async fn set_subtitle_delay(
    state: State<'_, Arc<AppState>>,
    payload: SubDelayPayload,
) -> AppResult<()> {
    state
        .mpv
        .backend()
        .execute(MpvCommand::SetSubtitleDelay(payload.delay_ms))
        .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubScalePayload {
    pub scale: f64,
}

#[tauri::command]
pub async fn set_subtitle_scale(
    state: State<'_, Arc<AppState>>,
    payload: SubScalePayload,
) -> AppResult<()> {
    state
        .mpv
        .backend()
        .execute(MpvCommand::SetSubtitleScale(payload.scale))
        .await
}

#[tauri::command]
pub async fn cycle_subtitle(state: State<'_, Arc<AppState>>) -> AppResult<()> {
    state.mpv.backend().execute(MpvCommand::CycleSubtitle).await
}
