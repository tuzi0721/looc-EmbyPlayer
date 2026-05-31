//! Subtitle commands: list available subtitles for the current item (built-in
//! tracks reported by mpv + Emby-provided tracks), add external/sidecar
//! subtitle files, and adjust delay / appearance.

use std::path::Path;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use url::Url;

use crate::emby::endpoints;
use crate::error::{AppError, AppResult};
use crate::mpv::{MpvCommand, SubtitleStyle};
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineSubtitleSearchPayload {
    pub provider: String,
    pub token: String,
    pub query: String,
    #[serde(default)]
    pub limit: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineSubtitleSearchResult {
    pub provider: String,
    pub id: String,
    pub title: String,
    pub video_name: Option<String>,
    pub language: Option<String>,
    pub format: Option<String>,
    pub release_site: Option<String>,
    pub upload_time: Option<String>,
    pub score: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineSubtitleSearchResponse {
    pub provider: String,
    pub results: Vec<OnlineSubtitleSearchResult>,
    pub quota: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineSubtitleResolvePayload {
    pub provider: String,
    pub token: String,
    pub id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineSubtitleResolveResult {
    pub provider: String,
    pub id: String,
    pub title: String,
    pub source: String,
    pub file_name: Option<String>,
    pub format: Option<String>,
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
        .playback_info_for_line(
            &server,
            &account,
            &session.item_id,
            None,
            Some(&session.line_id),
        )
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

    let line = state.emby.pick_line(&server, Some(&session.line_id))?;

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

fn text_value(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(text) => {
            let text = text.trim();
            if text.is_empty() {
                None
            } else {
                Some(text.to_string())
            }
        }
        Value::Number(number) => Some(number.to_string()),
        _ => None,
    }
}

fn number_value(value: Option<&Value>) -> Option<f64> {
    match value? {
        Value::Number(number) => number.as_f64(),
        Value::String(text) => text.parse::<f64>().ok(),
        _ => None,
    }
}

async fn assrt_request(path: &str, token: &str, params: &[(&str, String)]) -> AppResult<Value> {
    let token = token.trim();
    if token.is_empty() {
        return Err(AppError::Auth("ASSRT token is required".into()));
    }
    let mut url = Url::parse(&format!(
        "https://api.assrt.net/v1/{}",
        path.trim_start_matches('/')
    ))?;
    {
        let mut query = url.query_pairs_mut();
        for (key, value) in params {
            if !value.is_empty() {
                query.append_pair(key, value);
            }
        }
    }
    let response = reqwest::Client::new()
        .get(url)
        .bearer_auth(token)
        .header("Accept", "application/json")
        .header("User-Agent", "Hills Lite/0.1 (subtitle-search)")
        .send()
        .await?;
    let status = response.status();
    let json = response.json::<Value>().await?;
    if !status.is_success() {
        let message = text_value(json.get("message").or_else(|| json.get("error")))
            .unwrap_or_else(|| format!("ASSRT HTTP {status}"));
        return Err(AppError::Other(message));
    }
    if let Some(code) = number_value(json.get("status").or_else(|| json.get("code"))) {
        if code != 0.0 {
            let message = text_value(json.get("message").or_else(|| json.get("error")))
                .unwrap_or_else(|| format!("ASSRT status {code}"));
            return Err(AppError::Other(message));
        }
    }
    Ok(json)
}

fn assrt_subs(value: &Value) -> Vec<&Value> {
    let data = value.get("data").unwrap_or(value);
    [
        data.pointer("/sub/subs"),
        data.get("subs"),
        data.pointer("/result/subs"),
        data.get("result"),
    ]
    .into_iter()
    .flatten()
    .find_map(|value| value.as_array())
    .map(|items| items.iter().collect())
    .unwrap_or_default()
}

fn normalize_assrt_search_item(value: &Value) -> Option<OnlineSubtitleSearchResult> {
    let id = text_value(
        value
            .get("id")
            .or_else(|| value.get("sid"))
            .or_else(|| value.get("sub_id")),
    )?;
    let title = text_value(value.get("native_name"))
        .or_else(|| text_value(value.get("title")))
        .or_else(|| text_value(value.get("videoname")))
        .or_else(|| text_value(value.get("filename")))
        .unwrap_or_else(|| id.clone());
    Some(OnlineSubtitleSearchResult {
        provider: "assrt".into(),
        id,
        title,
        video_name: text_value(value.get("videoname").or_else(|| value.get("video_name"))),
        language: value
            .get("lang")
            .and_then(|lang| text_value(lang.get("desc").or_else(|| lang.get("name"))))
            .or_else(|| text_value(value.get("lang").or_else(|| value.get("language")))),
        format: text_value(
            value
                .get("subtype")
                .or_else(|| value.get("file_type"))
                .or_else(|| value.get("format")),
        ),
        release_site: text_value(
            value
                .get("release_site")
                .or_else(|| value.get("releaseSite")),
        ),
        upload_time: text_value(value.get("upload_time").or_else(|| value.get("uploadTime"))),
        score: number_value(
            value
                .get("vote_score")
                .or_else(|| value.get("score"))
                .or_else(|| value.get("rate")),
        ),
    })
}

#[tauri::command]
pub async fn search_online_subtitles(
    payload: OnlineSubtitleSearchPayload,
) -> AppResult<OnlineSubtitleSearchResponse> {
    if payload.provider != "assrt" {
        return Err(AppError::InvalidState(
            "unsupported subtitle provider".into(),
        ));
    }
    let query = payload.query.trim();
    if query.chars().count() < 3 {
        return Ok(OnlineSubtitleSearchResponse {
            provider: "assrt".into(),
            results: vec![],
            quota: None,
        });
    }
    let limit = payload.limit.unwrap_or(10).clamp(1, 15);
    let json = assrt_request(
        "sub/search",
        &payload.token,
        &[
            ("q", query.to_string()),
            ("cnt", limit.to_string()),
            ("pos", "0".into()),
        ],
    )
    .await?;
    let results = assrt_subs(&json)
        .into_iter()
        .filter_map(normalize_assrt_search_item)
        .take(limit)
        .collect();
    let quota = number_value(json.get("quota").or_else(|| json.pointer("/data/quota")));
    Ok(OnlineSubtitleSearchResponse {
        provider: "assrt".into(),
        results,
        quota,
    })
}

fn preferred_assrt_file(files: Option<&Value>) -> Option<&Value> {
    let items = files?.as_array()?;
    let supported = [".srt", ".ass", ".ssa", ".vtt"];
    items
        .iter()
        .find(|file| {
            let name = text_value(
                file.get("f")
                    .or_else(|| file.get("filename"))
                    .or_else(|| file.get("name")),
            )
            .unwrap_or_default()
            .to_ascii_lowercase();
            supported.iter().any(|ext| name.ends_with(ext))
        })
        .or_else(|| {
            items.iter().find(|file| {
                text_value(
                    file.get("url")
                        .or_else(|| file.get("download_url"))
                        .or_else(|| file.get("link")),
                )
                .is_some()
            })
        })
}

#[tauri::command]
pub async fn resolve_online_subtitle(
    payload: OnlineSubtitleResolvePayload,
) -> AppResult<OnlineSubtitleResolveResult> {
    if payload.provider != "assrt" {
        return Err(AppError::InvalidState(
            "unsupported subtitle provider".into(),
        ));
    }
    let id = payload.id.trim();
    if id.is_empty() {
        return Err(AppError::InvalidState("subtitle id is required".into()));
    }
    let json = assrt_request("sub/detail", &payload.token, &[("id", id.to_string())]).await?;
    let detail = assrt_subs(&json)
        .into_iter()
        .next()
        .or_else(|| json.get("sub"))
        .or_else(|| json.pointer("/data/sub"))
        .or_else(|| json.get("data"))
        .unwrap_or(&json);
    let file = preferred_assrt_file(detail.get("filelist").or_else(|| detail.get("files")));
    let source = text_value(
        file.and_then(|file| {
            file.get("url")
                .or_else(|| file.get("download_url"))
                .or_else(|| file.get("link"))
        })
        .or_else(|| {
            detail
                .get("url")
                .or_else(|| detail.get("download_url"))
                .or_else(|| detail.get("link"))
        }),
    )
    .ok_or_else(|| AppError::NotFound("ASSRT subtitle URL".into()))?;
    let file_name = text_value(file.and_then(|file| {
        file.get("f")
            .or_else(|| file.get("filename"))
            .or_else(|| file.get("name"))
    }));
    let title = text_value(detail.get("native_name"))
        .or_else(|| text_value(detail.get("title")))
        .or_else(|| text_value(detail.get("videoname")))
        .or_else(|| file_name.clone())
        .unwrap_or_else(|| id.to_string());
    let format = file_name.as_deref().and_then(|name| {
        name.rsplit_once('.')
            .map(|(_, ext)| ext.to_ascii_lowercase())
    });
    Ok(OnlineSubtitleResolveResult {
        provider: "assrt".into(),
        id: id.into(),
        title,
        source,
        file_name,
        format,
    })
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleStylePayload {
    pub scale: f64,
    pub text_color: String,
    pub outline_color: String,
    pub outline_size: f64,
    pub shadow_offset: f64,
    pub position_pct: u32,
    pub force_style: bool,
}

impl From<SubtitleStylePayload> for SubtitleStyle {
    fn from(value: SubtitleStylePayload) -> Self {
        Self {
            scale: value.scale.clamp(0.5, 2.5),
            text_color: value.text_color,
            outline_color: value.outline_color,
            outline_size: value.outline_size.clamp(0.0, 8.0),
            shadow_offset: value.shadow_offset.clamp(0.0, 8.0),
            position_pct: value.position_pct.clamp(0, 100),
            force_style: value.force_style,
        }
    }
}

#[tauri::command]
pub async fn set_subtitle_style(
    state: State<'_, Arc<AppState>>,
    payload: SubtitleStylePayload,
) -> AppResult<()> {
    state
        .mpv
        .backend()
        .execute(MpvCommand::SetSubtitleStyle(payload.into()))
        .await
}

#[tauri::command]
pub async fn cycle_subtitle(state: State<'_, Arc<AppState>>) -> AppResult<()> {
    state.mpv.backend().execute(MpvCommand::CycleSubtitle).await
}
