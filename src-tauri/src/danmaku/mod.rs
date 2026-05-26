pub mod dandanplay;
pub mod types;

use async_trait::async_trait;
use reqwest::Client;

use crate::emby::models::MediaItem;
use crate::error::AppResult;

pub use types::DanmakuResult;

#[async_trait]
pub trait DanmakuProvider: Send + Sync {
    fn id(&self) -> &'static str;
    fn display_name(&self) -> &'static str;

    /// Try to match a Emby/Jellyfin item to a provider-specific episode id.
    /// Returns `None` if no confident match is found.
    async fn match_item(&self, client: &Client, item: &MediaItem) -> AppResult<Option<String>>;

    async fn fetch(
        &self,
        client: &Client,
        provider_episode_id: &str,
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
