pub mod dandanplay;
pub mod types;
pub mod xml;

use async_trait::async_trait;
use reqwest::Client;

use crate::emby::models::MediaItem;
use crate::error::AppResult;

pub use types::DanmakuResult;

pub const DANMAKU_USER_AGENT: &str = "Hills Lite/0.1.0 (danmaku)";

#[async_trait]
pub trait DanmakuProvider: Send + Sync {
    fn id(&self) -> &'static str;
    fn display_name(&self) -> &'static str;

    /// Try to match a Emby/Jellyfin item to a provider-specific episode id.
    /// Returns `None` if no confident match is found.
    async fn match_item(&self, client: &Client, item: &MediaItem) -> AppResult<Option<String>>;

    async fn fetch(&self, client: &Client, provider_episode_id: &str) -> AppResult<DanmakuResult>;
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
/// `None` on any error or when there is no confident match. Used by the
/// standalone player host to feed `--danmaku-file`.
pub async fn fetch_item_danmaku(client: &Client, item: &MediaItem) -> Option<DanmakuResult> {
    let provider = by_id("dandanplay")?;
    let ep_id = provider.match_item(client, item).await.ok().flatten()?;
    provider.fetch(client, &ep_id).await.ok()
}
