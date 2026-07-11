pub mod dandanplay;
pub mod types;
pub mod xml;

use async_trait::async_trait;
use reqwest::Client;

use crate::emby::models::MediaItem;
use crate::error::AppResult;

pub use types::DanmakuResult;

pub const DANMAKU_USER_AGENT: &str = "Hills Lite/0.1.0 (danmaku)";

/// Normalize a user-supplied danmaku API base. Trims whitespace, strips trailing
/// slashes, and requires an http(s) scheme. Returns `None` when the input is
/// empty or malformed — callers treat `None` as "danmaku disabled" rather than
/// falling back to any hardcoded server.
pub fn normalize_danmaku_base(base: Option<&str>) -> Option<String> {
    let raw = base?.trim();
    if raw.is_empty() {
        return None;
    }
    if !raw.starts_with("http://") && !raw.starts_with("https://") {
        return None;
    }
    Some(raw.trim_end_matches('/').to_string())
}

#[async_trait]
pub trait DanmakuProvider: Send + Sync {
    fn id(&self) -> &'static str;
    fn display_name(&self) -> &'static str;

    /// Try to match a Emby/Jellyfin item to a provider-specific episode id.
    /// Returns `None` if no confident match is found. `api_base` is the
    /// normalized, user-configured server base (full calls are
    /// `{api_base}/api/v2/...`).
    async fn match_item(
        &self,
        client: &Client,
        item: &MediaItem,
        api_base: &str,
    ) -> AppResult<Option<String>>;

    async fn fetch(
        &self,
        client: &Client,
        provider_episode_id: &str,
        api_base: &str,
    ) -> AppResult<DanmakuResult>;
}

pub fn registry() -> Vec<&'static (dyn DanmakuProvider + 'static)> {
    use dandanplay::DanDanPlay;
    static DDP: DanDanPlay = DanDanPlay;
    vec![&DDP]
}

pub fn by_id(id: &str) -> Option<&'static (dyn DanmakuProvider + 'static)> {
    registry().into_iter().find(|p| p.id() == id)
}

/// Best-effort danmaku fetch for a media item using the default provider
/// (dandanplay): match the item to an episode then fetch its comments. Returns
/// `None` on any error, when there is no confident match, or when `api_base` is
/// empty/invalid (danmaku disabled). Used by the standalone player host to feed
/// `--danmaku-file`.
pub async fn fetch_item_danmaku(
    client: &Client,
    item: &MediaItem,
    api_base: Option<&str>,
) -> Option<DanmakuResult> {
    let api_base = normalize_danmaku_base(api_base)?;
    let provider = by_id("dandanplay")?;
    let ep_id = provider
        .match_item(client, item, &api_base)
        .await
        .ok()
        .flatten()?;
    provider.fetch(client, &ep_id, &api_base).await.ok()
}
