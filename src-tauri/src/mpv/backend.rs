use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::AppResult;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrackKind {
    Video,
    Audio,
    Subtitle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MpvTrackInfo {
    pub id: i64,
    pub kind: TrackKind,
    pub title: Option<String>,
    pub lang: Option<String>,
    pub codec: Option<String>,
    pub external: Option<bool>,
    pub default_track: Option<bool>,
    pub forced: Option<bool>,
    pub selected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MpvChapterInfo {
    pub index: i64,
    pub title: Option<String>,
    pub time_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MpvSnapshot {
    pub url: Option<String>,
    pub paused: bool,
    pub position_ms: i64,
    pub duration_ms: i64,
    pub speed: f64,
    pub volume: i32,
    pub muted: bool,
    pub eof: bool,
    pub tracks: Vec<MpvTrackInfo>,
    #[serde(default)]
    pub chapters: Vec<MpvChapterInfo>,
    #[serde(default)]
    pub chapter: Option<i64>,
    /// Current secondary subtitle track id, if mpv is stacking a second sub.
    #[serde(default)]
    pub secondary_sub_id: Option<i64>,
    /// Current subtitle delay in milliseconds (positive = later, negative = earlier).
    #[serde(default)]
    pub sub_delay_ms: i64,
    /// Current subtitle scale (font size multiplier). 1.0 = default.
    #[serde(default = "default_sub_scale")]
    pub sub_scale: f64,
    /// Current input/cache read rate in bytes per second, if mpv exposes it.
    #[serde(default)]
    pub network_bps: Option<f64>,
    #[serde(default)]
    pub video_codec: Option<String>,
    #[serde(default)]
    pub audio_codec: Option<String>,
    #[serde(default)]
    pub video_params: Option<Value>,
    #[serde(default)]
    pub audio_params: Option<Value>,
    #[serde(default)]
    pub hwdec_current: Option<String>,
    #[serde(default)]
    pub container_fps: Option<f64>,
    #[serde(default)]
    pub estimated_vf_fps: Option<f64>,
    #[serde(default)]
    pub video_bitrate: Option<f64>,
    #[serde(default)]
    pub audio_bitrate: Option<f64>,
    #[serde(default)]
    pub frame_drop_count: Option<f64>,
    #[serde(default)]
    pub decoder_frame_drop_count: Option<f64>,
    #[serde(default)]
    pub vo_frame_drop_count: Option<f64>,
}

fn default_sub_scale() -> f64 {
    1.0
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PictureMode {
    Fit,
    Fill,
    Stretch,
    Autocrop,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleStyle {
    pub scale: f64,
    pub text_color: String,
    pub outline_color: String,
    pub outline_size: f64,
    pub shadow_offset: f64,
    pub position_pct: u32,
    pub force_style: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MpvCommand {
    Load {
        url: String,
        headers: Vec<(String, String)>,
        user_agent: Option<String>,
        start_ms: Option<i64>,
        /// When set, mpv writes the streamed bytes verbatim to this local path
        /// (`--stream-record`) so the user can keep watching while the file is
        /// saved.
        stream_record_path: Option<String>,
    },
    Pause,
    Resume,
    Stop,
    Seek {
        position_ms: i64,
    },
    SetSpeed(f64),
    SetVolume(i32),
    SetMuted(bool),
    SetPictureMode(PictureMode),
    SetAudioTrack {
        id: i64,
        preserve_cache: bool,
    },
    SetSubtitleTrack {
        id: Option<i64>,
        preserve_cache: bool,
    },
    SetSecondarySubtitleTrack {
        id: Option<i64>,
    },
    /// Add a subtitle from a path or URL. `title` and `lang` may be set so
    /// the track shows up nicely in the picker. The track is selected by
    /// default.
    AddSubtitle {
        source: String,
        title: Option<String>,
        lang: Option<String>,
        /// When true, the added subtitle becomes the active sub immediately.
        select: bool,
    },
    /// Remove a previously added external subtitle by its mpv track id.
    RemoveSubtitle(i64),
    /// Set subtitle delay in milliseconds (positive = subs later).
    SetSubtitleDelay(i64),
    /// Set subtitle scale (font size multiplier). 1.0 = default.
    SetSubtitleScale(f64),
    /// Apply subtitle appearance settings to mpv.
    SetSubtitleStyle(SubtitleStyle),
    /// Cycle to the next subtitle track (or off, depending on mpv's policy).
    CycleSubtitle,
    /// Save the current video frame as a PNG.
    ScreenshotToFile {
        path: String,
        include_subtitles: bool,
    },
    /// Show mpv's built-in stats OSD page.
    ShowStatsOsd {
        page: u8,
    },
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MpvProperty {
    Pause(bool),
    PositionMs(i64),
    DurationMs(i64),
    Speed(f64),
    Volume(i32),
    Muted(bool),
    Eof(bool),
}

#[async_trait]
pub trait MpvBackend: Send + Sync {
    async fn execute(&self, cmd: MpvCommand) -> AppResult<()>;
    async fn snapshot(&self) -> AppResult<MpvSnapshot>;
    async fn shutdown(&self) -> AppResult<()>;
}
