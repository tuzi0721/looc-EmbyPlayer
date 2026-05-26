use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ServerKind {
    Emby,
    Jellyfin,
}

impl Default for ServerKind {
    fn default() -> Self {
        Self::Emby
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Line {
    pub id: String,
    pub name: String,
    pub base_url: String,
    #[serde(default)]
    pub user_agent: Option<String>,
    #[serde(default)]
    pub headers: Vec<(String, String)>,
    #[serde(default)]
    pub priority: i32,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub last_latency_ms: Option<u32>,
    #[serde(default)]
    pub last_status: Option<LineStatus>,
    #[serde(default)]
    pub last_checked_at: Option<DateTime<Utc>>,
}

fn default_true() -> bool {
    true
}

impl Line {
    pub fn new(name: impl Into<String>, base_url: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name: name.into(),
            base_url: base_url.into(),
            user_agent: None,
            headers: vec![],
            priority: 0,
            enabled: true,
            last_latency_ms: None,
            last_status: None,
            last_checked_at: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LineStatus {
    Healthy,
    Slow,
    Degraded,
    Down,
    Unknown,
}

impl Default for LineStatus {
    fn default() -> Self {
        Self::Unknown
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub server_id: String,
    pub user_id: String,
    pub username: String,
    pub access_token: String,
    #[serde(default)]
    pub avatar_tag: Option<String>,
    pub created_at: DateTime<Utc>,
    pub last_used_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Server {
    pub id: String,
    pub name: String,
    pub kind: ServerKind,
    pub lines: Vec<Line>,
    #[serde(default)]
    pub active_line_id: Option<String>,
    #[serde(default)]
    pub default_user_agent: Option<String>,
    #[serde(default)]
    pub auto_failover: bool,
    pub created_at: DateTime<Utc>,
}

impl Server {
    pub fn new(name: impl Into<String>, kind: ServerKind, lines: Vec<Line>) -> Self {
        let active_line_id = lines.first().map(|l| l.id.clone());
        Self {
            id: Uuid::new_v4().to_string(),
            name: name.into(),
            kind,
            lines,
            active_line_id,
            default_user_agent: None,
            auto_failover: true,
            created_at: Utc::now(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default = "default_heartbeat_secs")]
    pub heartbeat_interval_secs: u64,
    #[serde(default = "default_healthcheck_secs")]
    pub health_check_interval_secs: u64,
    #[serde(default = "default_race_timeout_ms")]
    pub race_timeout_ms: u64,
    #[serde(default = "default_request_timeout_ms")]
    pub request_timeout_ms: u64,
    #[serde(default = "default_global_ua")]
    pub default_user_agent: String,
    #[serde(default)]
    pub theme: Theme,
    #[serde(default = "default_blur_strength")]
    pub blur_strength: u32,
    #[serde(default = "default_true")]
    pub enable_window_vibrancy: bool,
    #[serde(default)]
    pub mpv_backend: MpvBackendKind,
    #[serde(default)]
    pub mpv_executable_path: Option<String>,
    #[serde(default = "default_true")]
    pub hardware_decoding: bool,
    #[serde(default = "default_cache_mb")]
    pub mpv_cache_mb: u32,
    /// Server ids that should be hidden from the sidebar list.
    /// They still exist in the store, they're just filtered out of the primary nav.
    #[serde(default)]
    pub hidden_server_ids: Vec<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            heartbeat_interval_secs: default_heartbeat_secs(),
            health_check_interval_secs: default_healthcheck_secs(),
            race_timeout_ms: default_race_timeout_ms(),
            request_timeout_ms: default_request_timeout_ms(),
            default_user_agent: default_global_ua(),
            theme: Theme::default(),
            blur_strength: default_blur_strength(),
            enable_window_vibrancy: true,
            mpv_backend: MpvBackendKind::default(),
            mpv_executable_path: None,
            hardware_decoding: true,
            mpv_cache_mb: default_cache_mb(),
            hidden_server_ids: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Dark,
    Light,
    Auto,
}

impl Default for Theme {
    fn default() -> Self {
        Self::Dark
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MpvBackendKind {
    Ipc,
    Embedded,
}

impl Default for MpvBackendKind {
    fn default() -> Self {
        Self::Ipc
    }
}

fn default_heartbeat_secs() -> u64 {
    180
}
fn default_healthcheck_secs() -> u64 {
    60
}
fn default_race_timeout_ms() -> u64 {
    3500
}
fn default_request_timeout_ms() -> u64 {
    15_000
}
fn default_global_ua() -> String {
    "Emby-Player/0.1 (Tauri; libmpv)".to_string()
}
fn default_blur_strength() -> u32 {
    24
}
fn default_cache_mb() -> u32 {
    256
}
