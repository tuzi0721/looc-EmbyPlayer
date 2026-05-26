use async_trait::async_trait;
use serde::{Deserialize, Serialize};

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
    pub selected: bool,
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
    /// Current subtitle delay in milliseconds (positive = later, negative = earlier).
    #[serde(default)]
    pub sub_delay_ms: i64,
    /// Current subtitle scale (font size multiplier). 1.0 = default.
    #[serde(default = "default_sub_scale")]
    pub sub_scale: f64,
}

fn default_sub_scale() -> f64 {
    1.0
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
    Seek { position_ms: i64 },
    SetSpeed(f64),
    SetVolume(i32),
    SetMuted(bool),
    SetAudioTrack(i64),
    SetSubtitleTrack(Option<i64>),
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
    /// Cycle to the next subtitle track (or off, depending on mpv's policy).
    CycleSubtitle,
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
