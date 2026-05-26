use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DownloadStatus {
    Pending,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

impl Default for DownloadStatus {
    fn default() -> Self {
        Self::Pending
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadTask {
    pub id: String,
    pub server_id: String,
    pub account_id: String,
    pub item_id: String,
    pub media_source_id: String,
    pub play_session_id: String,
    pub title: String,
    pub file_path: String,
    pub stream_url: String,
    pub container: Option<String>,
    pub total_bytes: Option<u64>,
    pub downloaded_bytes: u64,
    pub status: DownloadStatus,
    /// Stealth mode: while downloading we keep reporting Playing/Progress to
    /// the Emby/Jellyfin server so the session looks like a normal stream.
    pub stealth: bool,
    pub error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl DownloadTask {
    pub fn new(req: DownloadTaskRequest) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            server_id: req.server_id,
            account_id: req.account_id,
            item_id: req.item_id,
            media_source_id: req.media_source_id,
            play_session_id: req.play_session_id,
            title: req.title,
            file_path: req.file_path,
            stream_url: req.stream_url,
            container: req.container,
            total_bytes: req.total_bytes,
            downloaded_bytes: 0,
            status: DownloadStatus::Pending,
            stealth: req.stealth,
            error: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct DownloadTaskRequest {
    pub server_id: String,
    pub account_id: String,
    pub item_id: String,
    pub media_source_id: String,
    pub play_session_id: String,
    pub title: String,
    pub file_path: String,
    pub stream_url: String,
    pub container: Option<String>,
    pub total_bytes: Option<u64>,
    pub stealth: bool,
}
