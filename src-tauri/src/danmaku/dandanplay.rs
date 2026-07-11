use async_trait::async_trait;
use reqwest::header::{ACCEPT, CONTENT_TYPE, USER_AGENT};
use reqwest::Client;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use crate::danmaku::types::{DanmakuComment, DanmakuMode, DanmakuResult};
use crate::danmaku::{DanmakuProvider, DANMAKU_USER_AGENT};
use crate::emby::models::MediaItem;
use crate::error::{AppError, AppResult};

pub struct DanDanPlay;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MatchRequest {
    file_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    match_mode: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MatchResponse {
    #[serde(default)]
    is_matched: bool,
    #[serde(default)]
    matches: Option<Vec<MatchEntry>>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MatchEntry {
    episode_id: i64,
    #[serde(default)]
    animate_title: Option<String>,
    #[serde(default)]
    episode_title: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct CommentResponse {
    #[serde(default)]
    count: i64,
    #[serde(default)]
    comments: Vec<RawComment>,
}

#[derive(Debug, Deserialize)]
struct RawComment {
    /// `<time>,<mode>,<color>,<sender>` style metadata.
    #[serde(default)]
    p: String,
    #[serde(default)]
    m: String,
}

#[async_trait]
impl DanmakuProvider for DanDanPlay {
    fn id(&self) -> &'static str {
        "dandanplay"
    }
    fn display_name(&self) -> &'static str {
        "DanDanPlay"
    }

    async fn match_item(
        &self,
        client: &Client,
        item: &MediaItem,
        api_base: &str,
    ) -> AppResult<Option<String>> {
        let file_name = build_file_name(item);
        let body = MatchRequest {
            file_name,
            match_mode: Some("hashAndFileName".into()),
        };
        let url = format!("{api_base}/api/v2/match");
        let resp = client
            .post(&url)
            .header(USER_AGENT, DANMAKU_USER_AGENT)
            .header(ACCEPT, "application/json")
            .header(CONTENT_TYPE, "application/json")
            .json(&body)
            .send()
            .await?;
        let resp = ensure_success(resp, "dandanplay match").await?;
        let parsed: MatchResponse = decode_json(resp, "dandanplay match").await?;
        if !parsed.is_matched {
            return Ok(None);
        }
        let id = parsed
            .matches
            .as_ref()
            .and_then(|v| v.first())
            .map(|m| m.episode_id.to_string());
        Ok(id)
    }

    async fn fetch(
        &self,
        client: &Client,
        provider_episode_id: &str,
        api_base: &str,
    ) -> AppResult<DanmakuResult> {
        let url =
            format!("{api_base}/api/v2/comment/{provider_episode_id}?withRelated=true&chConvert=0");
        let resp = client
            .get(&url)
            .header(USER_AGENT, DANMAKU_USER_AGENT)
            .header(ACCEPT, "application/json")
            .send()
            .await?;
        let resp = ensure_success(resp, "dandanplay comment").await?;
        let parsed: CommentResponse = decode_json(resp, "dandanplay comment").await?;
        let comments = parsed
            .comments
            .into_iter()
            .filter_map(|c| parse_comment(&c.p, &c.m))
            .collect::<Vec<_>>();
        Ok(DanmakuResult {
            provider: "dandanplay".into(),
            episode_id: provider_episode_id.to_string(),
            comments,
        })
    }
}

async fn ensure_success(resp: reqwest::Response, context: &str) -> AppResult<reqwest::Response> {
    if resp.status().is_success() {
        return Ok(resp);
    }

    let status = resp.status();
    let url = resp.url().clone();
    let body = resp.text().await.unwrap_or_default();
    Err(AppError::Other(format!(
        "{context}: http {status} from {url}; body preview: {}",
        body_preview(&body)
    )))
}

async fn decode_json<T>(resp: reqwest::Response, context: &str) -> AppResult<T>
where
    T: DeserializeOwned,
{
    let status = resp.status();
    let url = resp.url().clone();
    let body = resp.text().await.map_err(|e| {
        AppError::Other(format!(
            "{context}: failed to read response body from {url} (status {status}): {e}"
        ))
    })?;

    serde_json::from_str(&body).map_err(|e| {
        AppError::Other(format!(
            "{context}: failed to parse JSON from {url} (status {status}): {e}; body preview: {}",
            body_preview(&body)
        ))
    })
}

fn body_preview(body: &str) -> String {
    const MAX_CHARS: usize = 1200;
    let mut preview = body.chars().take(MAX_CHARS).collect::<String>();
    if body.chars().count() > MAX_CHARS {
        preview.push_str("...");
    }
    preview.replace('\n', "\\n").replace('\r', "\\r")
}

fn build_file_name(item: &MediaItem) -> String {
    if item.item_type.as_deref() == Some("Episode") {
        let series = item.series_name.clone().unwrap_or_default();
        let season = item.parent_index_number.unwrap_or(1);
        let ep = item.index_number.unwrap_or(1);
        format!("{series} S{season:02}E{ep:02}")
    } else {
        item.name.clone()
    }
}

fn parse_comment(p: &str, text: &str) -> Option<DanmakuComment> {
    // DanDanPlay `p` format: time,mode,color,user
    let parts: Vec<&str> = p.split(',').collect();
    if parts.len() < 3 {
        return None;
    }
    let time: f64 = parts[0].parse().ok()?;
    let mode_n: i32 = parts[1].parse().ok()?;
    let color_n: i64 = parts[2].parse().ok()?;
    let mode = match mode_n {
        1 => DanmakuMode::Scroll,
        4 => DanmakuMode::Bottom,
        5 => DanmakuMode::Top,
        6 => DanmakuMode::Reverse,
        _ => DanmakuMode::Scroll,
    };
    let r = ((color_n >> 16) & 0xFF) as u8;
    let g = ((color_n >> 8) & 0xFF) as u8;
    let b = (color_n & 0xFF) as u8;
    let color = format!("#{:02x}{:02x}{:02x}", r, g, b);
    Some(DanmakuComment {
        time,
        mode,
        color,
        text: text.to_string(),
        source: Some("dandanplay".into()),
    })
}
