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
    /// Reference parity (HillsLite 设置·通用): closing the main window hides to
    /// the system tray instead of exiting. Default off.
    #[serde(default)]
    pub close_to_tray: bool,
    // Reference parity (HillsLite 设置·通用·网络). Applied when the HTTP client
    // is built (app start); changes take effect after restart.
    #[serde(default)]
    pub ignore_ssl_errors: bool,
    #[serde(default)]
    pub network_proxy_mode: NetworkProxyMode,
    #[serde(default)]
    pub http_proxy_url: String,
    // Reference parity (HillsLite 设置·播放器): preferred track languages
    // (ISO 639 codes for mpv --alang/--slang; empty = server default) and
    // forced stereo downmix (--audio-channels=stereo).
    #[serde(default)]
    pub preferred_audio_language: String,
    #[serde(default)]
    pub preferred_subtitle_language: String,
    #[serde(default)]
    pub force_stereo_audio: bool,
    // Reference parity (HillsLite 设置·播放器·弹幕): default-on switch, per-area
    // max rows, bold text, and remembering manually selected danmaku.
    #[serde(default = "default_true")]
    pub danmaku_enabled_default: bool,
    #[serde(default = "default_danmaku_scroll_rows")]
    pub danmaku_scroll_max_rows: u32,
    #[serde(default = "default_danmaku_fixed_rows")]
    pub danmaku_top_max_rows: u32,
    #[serde(default = "default_danmaku_fixed_rows")]
    pub danmaku_bottom_max_rows: u32,
    #[serde(default)]
    pub danmaku_bold: bool,
    #[serde(default = "default_true")]
    pub danmaku_remember_selection: bool,
    // Reference parity (HillsLite 设置·外部播放器): explicit external mpv /
    // PotPlayer groups (enable + path; mpv additionally honors the app proxy).
    // The legacy generic external_player_path stays as a fallback.
    #[serde(default)]
    pub external_mpv_enabled: bool,
    #[serde(default)]
    pub external_mpv_path: Option<String>,
    #[serde(default)]
    pub external_mpv_use_proxy: bool,
    #[serde(default)]
    pub external_potplayer_enabled: bool,
    #[serde(default)]
    pub external_potplayer_path: Option<String>,
    // Reference parity (HillsLite「标记已看的进度阈值」): percent of duration
    // after which the item is explicitly marked played on stop.
    #[serde(default = "default_mark_watched_threshold_pct")]
    pub mark_watched_threshold_pct: u32,
    // Reference parity (HillsLite「首选版本」): auto-pick strategy when an item
    // has multiple local-decode-capable media sources.
    #[serde(default)]
    pub preferred_version_strategy: PreferredVersionStrategy,
    // Reference parity (HillsLite 设置·调试「播放器日志」): write mpv logs to
    // the app log directory for diagnosis.
    #[serde(default)]
    pub player_log_enabled: bool,
    #[serde(default)]
    pub mpv_backend: MpvBackendKind,
    #[serde(default)]
    pub external_player_path: Option<String>,
    #[serde(default)]
    pub external_player_args: String,
    #[serde(default = "default_true")]
    pub hardware_decoding: bool,
    #[serde(default = "default_cache_mb")]
    pub mpv_cache_mb: u32,
    /// Server ids that should be hidden from the sidebar list.
    /// They still exist in the store, they're just filtered out of the primary nav.
    #[serde(default)]
    pub hidden_server_ids: Vec<String>,
    #[serde(default)]
    pub hide_jav_codes: bool,
    #[serde(default)]
    pub show_network_speed: bool,
    #[serde(default)]
    pub stats_overlay_mode: StatsOverlayMode,
    #[serde(default)]
    pub blackout_other_displays: bool,
    #[serde(default = "default_true")]
    pub preserve_track_switch_cache: bool,
    #[serde(default)]
    pub skip_intro_outro_enabled: bool,
    #[serde(default = "default_skip_intro_seconds")]
    pub skip_intro_seconds: u32,
    #[serde(default = "default_skip_outro_seconds")]
    pub skip_outro_seconds: u32,
    // Reference parity (HillsLite 设置·播放器·交互): seek-step seconds for the
    // forward/back nudges and the long-press speed-play rate.
    #[serde(default = "default_seek_step_seconds")]
    pub seek_forward_seconds: u32,
    #[serde(default = "default_seek_step_seconds")]
    pub seek_backward_seconds: u32,
    #[serde(default = "default_long_press_speed_rate")]
    pub long_press_speed_rate: f64,
    #[serde(default = "default_true")]
    pub screenshot_include_subtitles: bool,
    #[serde(default)]
    pub append_auth_query: bool,
    #[serde(default)]
    pub download_directory: Option<String>,
    #[serde(default)]
    pub home_hero_style: HomeHeroStyle,
    #[serde(default)]
    pub trakt_sync_enabled: bool,
    #[serde(default)]
    pub trakt_username: Option<String>,
    #[serde(default = "default_true")]
    pub trakt_sync_watched: bool,
    #[serde(default = "default_true")]
    pub trakt_sync_ratings: bool,
    #[serde(default)]
    pub trakt_sync_favorites: bool,
    #[serde(default = "default_danmaku_opacity")]
    pub danmaku_opacity: f32,
    #[serde(default = "default_danmaku_speed")]
    pub danmaku_speed: f32,
    #[serde(default = "default_danmaku_font_size")]
    pub danmaku_font_size: u32,
    #[serde(default = "default_true")]
    pub danmaku_avoid_subtitles: bool,
    #[serde(default = "default_danmaku_bottom_reserve_pct")]
    pub danmaku_bottom_reserve_pct: u32,
    #[serde(default = "default_subtitle_scale")]
    pub subtitle_scale: f64,
    #[serde(default = "default_subtitle_text_color")]
    pub subtitle_text_color: String,
    #[serde(default = "default_subtitle_outline_color")]
    pub subtitle_outline_color: String,
    #[serde(default = "default_subtitle_outline_size")]
    pub subtitle_outline_size: f64,
    #[serde(default)]
    pub subtitle_shadow_offset: f64,
    #[serde(default = "default_subtitle_position_pct")]
    pub subtitle_position_pct: u32,
    #[serde(default)]
    pub subtitle_force_style: bool,
    #[serde(default)]
    pub anime4k_mode: Anime4kMode,
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
            close_to_tray: false,
            ignore_ssl_errors: false,
            network_proxy_mode: NetworkProxyMode::default(),
            http_proxy_url: String::new(),
            preferred_audio_language: String::new(),
            preferred_subtitle_language: String::new(),
            force_stereo_audio: false,
            danmaku_enabled_default: true,
            danmaku_scroll_max_rows: default_danmaku_scroll_rows(),
            danmaku_top_max_rows: default_danmaku_fixed_rows(),
            danmaku_bottom_max_rows: default_danmaku_fixed_rows(),
            danmaku_bold: false,
            danmaku_remember_selection: true,
            external_mpv_enabled: false,
            external_mpv_path: None,
            external_mpv_use_proxy: false,
            external_potplayer_enabled: false,
            external_potplayer_path: None,
            mark_watched_threshold_pct: default_mark_watched_threshold_pct(),
            preferred_version_strategy: PreferredVersionStrategy::default(),
            player_log_enabled: false,
            mpv_backend: MpvBackendKind::default(),
            external_player_path: None,
            external_player_args: String::new(),
            hardware_decoding: true,
            mpv_cache_mb: default_cache_mb(),
            hidden_server_ids: Vec::new(),
            hide_jav_codes: false,
            show_network_speed: false,
            stats_overlay_mode: StatsOverlayMode::default(),
            blackout_other_displays: false,
            preserve_track_switch_cache: true,
            skip_intro_outro_enabled: false,
            skip_intro_seconds: default_skip_intro_seconds(),
            skip_outro_seconds: default_skip_outro_seconds(),
            seek_forward_seconds: default_seek_step_seconds(),
            seek_backward_seconds: default_seek_step_seconds(),
            long_press_speed_rate: default_long_press_speed_rate(),
            screenshot_include_subtitles: true,
            append_auth_query: false,
            download_directory: None,
            home_hero_style: HomeHeroStyle::default(),
            trakt_sync_enabled: false,
            trakt_username: None,
            trakt_sync_watched: true,
            trakt_sync_ratings: true,
            trakt_sync_favorites: false,
            danmaku_opacity: default_danmaku_opacity(),
            danmaku_speed: default_danmaku_speed(),
            danmaku_font_size: default_danmaku_font_size(),
            danmaku_avoid_subtitles: true,
            danmaku_bottom_reserve_pct: default_danmaku_bottom_reserve_pct(),
            subtitle_scale: default_subtitle_scale(),
            subtitle_text_color: default_subtitle_text_color(),
            subtitle_outline_color: default_subtitle_outline_color(),
            subtitle_outline_size: default_subtitle_outline_size(),
            subtitle_shadow_offset: 0.0,
            subtitle_position_pct: default_subtitle_position_pct(),
            subtitle_force_style: false,
            anime4k_mode: Anime4kMode::default(),
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

/// Reference parity (HillsLite 设置·通用·网络): outbound proxy policy for the
/// app's HTTP client. `System` follows the environment/system proxy (reqwest
/// default), `None` forces direct, `Custom` uses `http_proxy_url`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NetworkProxyMode {
    None,
    System,
    Custom,
}

impl Default for NetworkProxyMode {
    fn default() -> Self {
        Self::System
    }
}

/// Reference parity (HillsLite 设置·播放器「首选版本」): how to auto-pick a
/// media source when an item exposes multiple local-decode-capable versions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PreferredVersionStrategy {
    Default,
    HdrFirst,
    SdrFirst,
    HighBitrate,
    LowBitrate,
    HighFramerate,
}

impl Default for PreferredVersionStrategy {
    fn default() -> Self {
        Self::Default
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HomeHeroStyle {
    Classic,
    Cinema,
}

impl Default for HomeHeroStyle {
    fn default() -> Self {
        Self::Cinema
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Anime4kMode {
    Off,
    ModeAFast,
    ModeA,
    ModeB,
    ModeC,
    High,
}

impl Default for Anime4kMode {
    fn default() -> Self {
        Self::Off
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum StatsOverlayMode {
    Winui,
    MpvOsd,
}

impl Default for StatsOverlayMode {
    fn default() -> Self {
        Self::Winui
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
        #[cfg(feature = "mpv-embedded")]
        {
            Self::Embedded
        }
        #[cfg(not(feature = "mpv-embedded"))]
        {
            Self::Ipc
        }
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
fn default_danmaku_opacity() -> f32 {
    0.85
}
fn default_danmaku_speed() -> f32 {
    1.0
}
fn default_danmaku_font_size() -> u32 {
    22
}
fn default_danmaku_bottom_reserve_pct() -> u32 {
    18
}
fn default_subtitle_scale() -> f64 {
    1.0
}
fn default_subtitle_text_color() -> String {
    "#FFFFFF".to_string()
}
fn default_subtitle_outline_color() -> String {
    "#000000".to_string()
}
fn default_subtitle_outline_size() -> f64 {
    1.65
}
fn default_subtitle_position_pct() -> u32 {
    100
}
fn default_skip_intro_seconds() -> u32 {
    90
}
fn default_skip_outro_seconds() -> u32 {
    90
}
fn default_seek_step_seconds() -> u32 {
    10
}
fn default_long_press_speed_rate() -> f64 {
    2.0
}
fn default_danmaku_scroll_rows() -> u32 {
    5
}
fn default_danmaku_fixed_rows() -> u32 {
    3
}
fn default_mark_watched_threshold_pct() -> u32 {
    90
}
