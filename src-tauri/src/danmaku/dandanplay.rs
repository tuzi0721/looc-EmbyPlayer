use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::danmaku::types::{DanmakuComment, DanmakuMode, DanmakuResult};
use crate::danmaku::DanmakuProvider;
use crate::emby::models::MediaItem;
use crate::error::{AppError, AppResult};

const API_BASE: &str = "https://api.dandanplay.net";

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
    is_matched: bool,
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
    count: i64,
    comments: Vec<RawComment>,
}

#[derive(Debug, Deserialize)]
struct RawComment {
    /// `<time>,<mode>,<color>,<sender>` style metadata.
    p: String,
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

    async fn match_item(&self, client: &Client, item: &MediaItem) -> AppResult<Option<String>> {
        let file_name = build_file_name(item);
        let body = MatchRequest {
            file_name,
            match_mode: Some("hashAndFileName".into()),
        };
        let url = format!("{API_BASE}/api/v2/match");
        let resp = client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(AppError::Other(format!("dandanplay match http {}", resp.status())));
        }
        let parsed: MatchResponse = resp.json().await?;
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
    ) -> AppResult<DanmakuResult> {
        let url = format!("{API_BASE}/api/v2/comment/{provider_episode_id}?withRelated=true&chConvert=0");
        let resp = client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(AppError::Other(format!("dandanplay comment http {}", resp.status())));
        }
        let parsed: CommentResponse = resp.json().await?;
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
