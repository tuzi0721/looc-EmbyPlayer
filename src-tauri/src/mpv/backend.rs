use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::config::models::Anime4kMode;
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
    pub video_out_params: Option<Value>,
    #[serde(default)]
    pub osd_dimensions: Option<Value>,
    #[serde(default)]
    pub audio_params: Option<Value>,
    #[serde(default)]
    pub hwdec_current: Option<String>,
    #[serde(default)]
    pub idle_active: Option<bool>,
    #[serde(default)]
    pub demuxer: Option<String>,
    #[serde(default)]
    pub file_format: Option<String>,
    #[serde(default)]
    pub media_title: Option<String>,
    #[serde(default)]
    pub stream_open_filename: Option<String>,
    #[serde(default)]
    pub stream_path: Option<String>,
    #[serde(default)]
    pub demuxer_cache_state: Option<Value>,
    #[serde(default)]
    pub playlist_count: Option<i64>,
    #[serde(default)]
    pub playlist_pos: Option<i64>,
    #[serde(default)]
    pub keepaspect: Option<bool>,
    #[serde(default)]
    pub panscan: Option<f64>,
    #[serde(default)]
    pub video_zoom: Option<f64>,
    #[serde(default)]
    pub video_scale_x: Option<f64>,
    #[serde(default)]
    pub video_scale_y: Option<f64>,
    #[serde(default)]
    pub video_aspect_override: Option<f64>,
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
    #[serde(default)]
    pub backend_diagnostics: Option<Value>,
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
    pub bold: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MpvCommand {
    Load {
        url: String,
        headers: Vec<(String, String)>,
        user_agent: Option<String>,
        start_ms: Option<i64>,
        /// Whether the chosen HTTP source passed a real Range preflight.
        /// `Some(false)` is loaded with per-file lavf `seekable=0` so the
        /// local proxy stream is read sequentially instead of issuing broken
        /// upstream Range retries.
        http_seekable: Option<bool>,
        /// When set, mpv writes the streamed bytes verbatim to this local path
        /// (`--stream-record`) so the user can keep watching while the file is
        /// saved.
        stream_record_path: Option<String>,
        autoload_subtitles: bool,
    },
    Pause,
    Resume,
    Stop,
    Seek {
        position_ms: i64,
    },
    SeekRelative {
        delta_ms: i64,
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
    /// Apply an Anime4K GLSL shader preset (or clear when Off).
    SetAnime4kMode(Anime4kMode),
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

/// Line prefix written by the bundled `hills_external_reporter.lua` mpv script
/// (see `resources/mpv/hills_external_reporter.lua`). Each reporter event is a
/// single stdout line of the form `HILLS_MPV_EVENT:{json}` so the host can tell
/// reporter events apart from mpv's own stdout chatter.
pub const HILLS_MPV_EVENT_PREFIX: &str = "HILLS_MPV_EVENT:";

/// A progress event emitted by the external mpv reporter script. These map onto
/// Emby session reporting (progress / pause / stop); see
/// `crate::emby::session_controller`.
#[derive(Debug, Clone, PartialEq)]
pub enum MpvReporterEvent {
    /// mpv began loading a new playlist entry.
    StartFile,
    /// The current file finished loading and playback is starting.
    FileLoaded {
        time_pos: f64,
        media_title: Option<String>,
        path: Option<String>,
    },
    /// The user (or a command) seeked to a new position.
    Seek { time_pos: f64 },
    /// Periodic playback position tick. Emitted frequently; throttle before
    /// forwarding to the server.
    TimePos { time_pos: f64 },
    /// Pause state toggled.
    Pause { paused: bool, time_pos: Option<f64> },
    /// Playback speed changed.
    Speed { speed: f64 },
    /// The current file stopped (eof, user stop, error, quit, ...).
    EndFile {
        time_pos: f64,
        reason: Option<String>,
    },
}

#[derive(Debug, serde::Deserialize)]
struct RawReporterEvent {
    event: String,
    // mpv numbers arrive as JSON ints or floats depending on the property, so
    // every numeric field is decoded as `f64` (serde accepts both shapes).
    #[serde(default)]
    time_pos: Option<f64>,
    #[serde(default)]
    paused: Option<bool>,
    #[serde(default)]
    speed: Option<f64>,
    #[serde(default)]
    reason: Option<String>,
    #[serde(default)]
    media_title: Option<String>,
    #[serde(default)]
    path: Option<String>,
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.filter(|s| !s.trim().is_empty())
}

/// Parse a single stdout line into an [`MpvReporterEvent`].
///
/// Returns `None` when the line does not carry a reporter event or cannot be
/// understood (unknown event name, malformed JSON, missing required fields).
/// The prefix may appear anywhere in the line so incidental mpv stdout noise in
/// front of it is tolerated.
pub fn parse_reporter_event(line: &str) -> Option<MpvReporterEvent> {
    let start = line.find(HILLS_MPV_EVENT_PREFIX)?;
    let json = line[start + HILLS_MPV_EVENT_PREFIX.len()..].trim();
    if json.is_empty() {
        return None;
    }
    let raw: RawReporterEvent = serde_json::from_str(json).ok()?;
    let event = match raw.event.as_str() {
        "start-file" => MpvReporterEvent::StartFile,
        "file-loaded" => MpvReporterEvent::FileLoaded {
            time_pos: raw.time_pos.unwrap_or(0.0),
            media_title: non_empty(raw.media_title),
            path: non_empty(raw.path),
        },
        "seek" => MpvReporterEvent::Seek {
            time_pos: raw.time_pos.unwrap_or(0.0),
        },
        "time-pos" => MpvReporterEvent::TimePos {
            time_pos: raw.time_pos?,
        },
        "pause" => MpvReporterEvent::Pause {
            paused: raw.paused.unwrap_or(false),
            time_pos: raw.time_pos,
        },
        "speed" => MpvReporterEvent::Speed {
            speed: raw.speed.unwrap_or(1.0),
        },
        "end-file" => MpvReporterEvent::EndFile {
            time_pos: raw.time_pos.unwrap_or(0.0),
            reason: non_empty(raw.reason),
        },
        _ => return None,
    };
    Some(event)
}

#[cfg(test)]
mod reporter_tests {
    use super::*;

    #[test]
    fn parses_file_loaded_with_metadata() {
        let line = "HILLS_MPV_EVENT:{\"event\":\"file-loaded\",\"playlist_pos\":0,\"time_pos\":12.5,\"media_title\":\"Ep 1\",\"path\":\"http://x/a.mkv\"}";
        assert_eq!(
            parse_reporter_event(line),
            Some(MpvReporterEvent::FileLoaded {
                time_pos: 12.5,
                media_title: Some("Ep 1".into()),
                path: Some("http://x/a.mkv".into()),
            })
        );
    }

    #[test]
    fn parses_integer_time_pos_as_float() {
        let line = "HILLS_MPV_EVENT:{\"event\":\"time-pos\",\"playlist_pos\":0,\"time_pos\":30}";
        assert_eq!(
            parse_reporter_event(line),
            Some(MpvReporterEvent::TimePos { time_pos: 30.0 })
        );
    }

    #[test]
    fn parses_pause_and_speed() {
        assert_eq!(
            parse_reporter_event("HILLS_MPV_EVENT:{\"event\":\"pause\",\"paused\":true}"),
            Some(MpvReporterEvent::Pause {
                paused: true,
                time_pos: None
            })
        );
        assert_eq!(
            parse_reporter_event("HILLS_MPV_EVENT:{\"event\":\"speed\",\"speed\":1.25}"),
            Some(MpvReporterEvent::Speed { speed: 1.25 })
        );
    }

    #[test]
    fn parses_end_file_with_reason() {
        assert_eq!(
            parse_reporter_event(
                "HILLS_MPV_EVENT:{\"event\":\"end-file\",\"reason\":\"eof\",\"time_pos\":99.0}"
            ),
            Some(MpvReporterEvent::EndFile {
                time_pos: 99.0,
                reason: Some("eof".into()),
            })
        );
    }

    #[test]
    fn tolerates_leading_noise_before_prefix() {
        let line = "[ffmpeg] junk HILLS_MPV_EVENT:{\"event\":\"start-file\"}";
        assert_eq!(
            parse_reporter_event(line),
            Some(MpvReporterEvent::StartFile)
        );
    }

    #[test]
    fn empty_strings_become_none() {
        let line = "HILLS_MPV_EVENT:{\"event\":\"file-loaded\",\"time_pos\":0,\"media_title\":\"\",\"path\":\"\"}";
        assert_eq!(
            parse_reporter_event(line),
            Some(MpvReporterEvent::FileLoaded {
                time_pos: 0.0,
                media_title: None,
                path: None,
            })
        );
    }

    #[test]
    fn rejects_non_event_and_malformed_lines() {
        assert_eq!(parse_reporter_event("just a normal mpv log line"), None);
        assert_eq!(parse_reporter_event("HILLS_MPV_EVENT:not-json"), None);
        assert_eq!(parse_reporter_event("HILLS_MPV_EVENT:"), None);
        assert_eq!(
            parse_reporter_event("HILLS_MPV_EVENT:{\"event\":\"unknown-thing\"}"),
            None
        );
        // time-pos without a time_pos field is unusable.
        assert_eq!(
            parse_reporter_event("HILLS_MPV_EVENT:{\"event\":\"time-pos\"}"),
            None
        );
    }
}
