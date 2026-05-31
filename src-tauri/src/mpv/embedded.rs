//! Embedded libmpv backend (feature `mpv-embedded`).
//!
//! Renders mpv into a native child window owned by `HostWindow`, which sits
//! beneath Tauri's webview. The frontend reports the player area rectangle
//! (CSS pixels) and the backend repositions the child window to match.

use std::sync::Arc;

use async_trait::async_trait;
use libmpv2::Mpv;
use parking_lot::{Mutex, RwLock};

use crate::error::{AppError, AppResult};
use crate::mpv::backend::{
    MpvBackend, MpvChapterInfo, MpvCommand, MpvSnapshot, MpvTrackInfo, PictureMode, TrackKind,
};
use crate::mpv::window_host::{HostWindow, ParentHandle, PlayerRect};

pub struct MpvEmbeddedBackend {
    mpv: Arc<Mutex<Mpv>>,
    host: Arc<RwLock<Option<HostWindow>>>,
}

fn drop_buffers_if_requested(mpv: &Mpv, preserve_cache: bool) -> AppResult<()> {
    if preserve_cache {
        return Ok(());
    }
    if let Err(e) = mpv.command("drop-buffers", &[]) {
        tracing::warn!(target = "mpv", error = %e, "drop-buffers failed after track switch");
    }
    Ok(())
}

impl MpvEmbeddedBackend {
    pub fn new() -> AppResult<Self> {
        let mpv = Mpv::new().map_err(|e| AppError::Mpv(format!("libmpv init: {e}")))?;
        mpv.set_property("hwdec", "auto-safe").ok();
        mpv.set_property("keep-open", "yes").ok();
        Ok(Self {
            mpv: Arc::new(Mutex::new(mpv)),
            host: Arc::new(RwLock::new(None)),
        })
    }

    /// Bind a native child window to the mpv core. Subsequent `Load` calls will
    /// render into this window.
    pub fn bind_window(&self, parent: ParentHandle) -> AppResult<()> {
        let host = HostWindow::create_child(parent)?;
        let wid = host.wid();
        {
            let m = self.mpv.lock();
            m.set_property("wid", wid)
                .map_err(|e| AppError::Mpv(format!("set wid: {e}")))?;
        }
        *self.host.write() = Some(host);
        Ok(())
    }

    pub fn set_rect(&self, rect: PlayerRect) -> AppResult<()> {
        match self.host.read().as_ref() {
            Some(h) => h.set_rect(rect),
            None => Ok(()),
        }
    }

    pub fn set_visible(&self, visible: bool) -> AppResult<()> {
        match self.host.read().as_ref() {
            Some(h) => h.show(visible),
            None => Ok(()),
        }
    }
}

#[async_trait]
impl MpvBackend for MpvEmbeddedBackend {
    async fn execute(&self, cmd: MpvCommand) -> AppResult<()> {
        let m = self.mpv.lock();
        match cmd {
            MpvCommand::Load {
                url,
                headers,
                user_agent,
                start_ms,
                stream_record_path,
            } => {
                if let Some(ua) = user_agent {
                    m.set_property("user-agent", ua.as_str())
                        .map_err(|e| AppError::Mpv(e.to_string()))?;
                }
                if !headers.is_empty() {
                    let hdr = headers
                        .iter()
                        .map(|(k, v)| format!("{k}: {v}"))
                        .collect::<Vec<_>>()
                        .join("\r\n");
                    m.set_property("http-header-fields", hdr.as_str())
                        .map_err(|e| AppError::Mpv(e.to_string()))?;
                }
                if let Some(ms) = start_ms {
                    let s = format!("{:.3}", ms as f64 / 1000.0);
                    m.set_property("start", s.as_str())
                        .map_err(|e| AppError::Mpv(e.to_string()))?;
                }
                if let Some(rec) = stream_record_path {
                    m.set_property("stream-record", rec.as_str())
                        .map_err(|e| AppError::Mpv(e.to_string()))?;
                } else {
                    m.set_property("stream-record", "").ok();
                }
                m.command("loadfile", &[&url, "replace"])
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                Ok(())
            }
            MpvCommand::Pause => m
                .set_property("pause", true)
                .map_err(|e| AppError::Mpv(e.to_string())),
            MpvCommand::Resume => m
                .set_property("pause", false)
                .map_err(|e| AppError::Mpv(e.to_string())),
            MpvCommand::Stop => m
                .command("stop", &[])
                .map_err(|e| AppError::Mpv(e.to_string())),
            MpvCommand::Seek { position_ms } => {
                let s = format!("{:.3}", position_ms as f64 / 1000.0);
                m.command("seek", &[s.as_str(), "absolute"])
                    .map_err(|e| AppError::Mpv(e.to_string()))
            }
            MpvCommand::SetSpeed(v) => m
                .set_property("speed", v)
                .map_err(|e| AppError::Mpv(e.to_string())),
            MpvCommand::SetVolume(v) => m
                .set_property("volume", v as i64)
                .map_err(|e| AppError::Mpv(e.to_string())),
            MpvCommand::SetMuted(b) => m
                .set_property("mute", b)
                .map_err(|e| AppError::Mpv(e.to_string())),
            MpvCommand::SetPictureMode(mode) => {
                let (keepaspect, panscan, zoom) = match mode {
                    PictureMode::Fit => (true, 0.0, 0.0),
                    PictureMode::Fill => (true, 1.0, 0.0),
                    PictureMode::Stretch => (false, 0.0, 0.0),
                    PictureMode::Autocrop => (true, 1.0, 0.16),
                };
                m.set_property("keepaspect", keepaspect)
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                m.set_property("panscan", panscan)
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                m.set_property("video-zoom", zoom)
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                m.set_property("video-scale-x", 1.0)
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                m.set_property("video-scale-y", 1.0)
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                m.set_property("video-aspect-override", -2)
                    .map_err(|e| AppError::Mpv(e.to_string()))
            }
            MpvCommand::SetAudioTrack { id, preserve_cache } => {
                m.set_property("aid", id)
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                drop_buffers_if_requested(&m, preserve_cache)
            }
            MpvCommand::SetSubtitleTrack { id, preserve_cache } => {
                if let Some(id) = id {
                    m.set_property("sid", id)
                        .map_err(|e| AppError::Mpv(e.to_string()))?;
                } else {
                    m.set_property("sid", "no")
                        .map_err(|e| AppError::Mpv(e.to_string()))?;
                }
                drop_buffers_if_requested(&m, preserve_cache)
            }
            MpvCommand::SetSecondarySubtitleTrack { id } => {
                if let Some(id) = id {
                    m.set_property("secondary-sid", id)
                        .map_err(|e| AppError::Mpv(e.to_string()))?;
                    m.set_property("secondary-sub-visibility", true)
                        .map_err(|e| AppError::Mpv(e.to_string()))
                } else {
                    m.set_property("secondary-sid", "no")
                        .map_err(|e| AppError::Mpv(e.to_string()))?;
                    m.set_property("secondary-sub-visibility", false)
                        .map_err(|e| AppError::Mpv(e.to_string()))
                }
            }
            MpvCommand::AddSubtitle {
                source,
                title,
                lang,
                select,
            } => {
                let flag = if select { "select" } else { "auto" };
                let title = title.unwrap_or_default();
                let lang = lang.unwrap_or_default();
                m.command(
                    "sub-add",
                    &[source.as_str(), flag, title.as_str(), lang.as_str()],
                )
                .map_err(|e| AppError::Mpv(e.to_string()))
            }
            MpvCommand::RemoveSubtitle(id) => {
                let s = id.to_string();
                m.command("sub-remove", &[s.as_str()])
                    .map_err(|e| AppError::Mpv(e.to_string()))
            }
            MpvCommand::SetSubtitleDelay(ms) => m
                .set_property("sub-delay", ms as f64 / 1000.0)
                .map_err(|e| AppError::Mpv(e.to_string())),
            MpvCommand::SetSubtitleScale(s) => m
                .set_property("sub-scale", s)
                .map_err(|e| AppError::Mpv(e.to_string())),
            MpvCommand::SetSubtitleStyle(style) => {
                m.set_property("sub-scale", style.scale)
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                m.set_property("sub-color", style.text_color.as_str())
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                m.set_property("sub-outline-color", style.outline_color.as_str())
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                m.set_property("sub-outline-size", style.outline_size)
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                m.set_property("sub-shadow-offset", style.shadow_offset)
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                m.set_property("sub-pos", style.position_pct as i64)
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                let ass_override = if style.force_style { "force" } else { "scale" };
                m.set_property("sub-ass-override", ass_override)
                    .map_err(|e| AppError::Mpv(e.to_string()))
            }
            MpvCommand::CycleSubtitle => m
                .command("cycle", &["sub"])
                .map_err(|e| AppError::Mpv(e.to_string())),
            MpvCommand::ScreenshotToFile {
                path,
                include_subtitles,
            } => {
                let mode = if include_subtitles {
                    "subtitles"
                } else {
                    "video"
                };
                m.command("screenshot-to-file", &[path.as_str(), mode])
                    .map_err(|e| AppError::Mpv(e.to_string()))
            }
            MpvCommand::ShowStatsOsd { page } => {
                let page = page.clamp(1, 5);
                let binding = format!("stats/display-page-{page}");
                if m.command("script-binding", &[binding.as_str()]).is_err() {
                    m.command("script-binding", &["stats/display-stats"])
                        .map_err(|e| AppError::Mpv(e.to_string()))?;
                }
                Ok(())
            }
        }
    }

    async fn snapshot(&self) -> AppResult<MpvSnapshot> {
        let m = self.mpv.lock();
        let url: Option<String> = m.get_property("path").ok();
        let paused: bool = m.get_property("pause").unwrap_or(true);
        let position: f64 = m.get_property("time-pos").unwrap_or(0.0);
        let duration: f64 = m.get_property("duration").unwrap_or(0.0);
        let speed: f64 = m.get_property("speed").unwrap_or(1.0);
        let volume: i64 = m.get_property("volume").unwrap_or(100);
        let muted: bool = m.get_property("mute").unwrap_or(false);
        let eof: bool = m.get_property("eof-reached").unwrap_or(false);
        let secondary_sub_id: Option<i64> = m.get_property("secondary-sid").ok();
        let sub_delay: f64 = m.get_property("sub-delay").unwrap_or(0.0);
        let sub_scale: f64 = m.get_property("sub-scale").unwrap_or(1.0);
        let network_bps = m
            .get_property::<i64>("cache-speed")
            .ok()
            .map(|v| v as f64)
            .filter(|v| v.is_finite() && *v >= 0.0);
        let video_codec: Option<String> = m.get_property("video-codec").ok();
        let audio_codec: Option<String> = m.get_property("audio-codec").ok();
        let hwdec_current: Option<String> = m.get_property("hwdec-current").ok();
        let container_fps: Option<f64> = m.get_property("container-fps").ok();
        let estimated_vf_fps: Option<f64> = m.get_property("estimated-vf-fps").ok();
        let video_bitrate: Option<i64> = m.get_property("video-bitrate").ok();
        let audio_bitrate: Option<i64> = m.get_property("audio-bitrate").ok();
        let frame_drop_count: Option<i64> = m.get_property("frame-drop-count").ok();
        let decoder_frame_drop_count: Option<i64> = m.get_property("decoder-frame-drop-count").ok();
        let vo_frame_drop_count: Option<i64> = m.get_property("vo-drop-frame-count").ok();

        Ok(MpvSnapshot {
            url,
            paused,
            position_ms: (position * 1000.0) as i64,
            duration_ms: (duration * 1000.0) as i64,
            speed,
            volume: volume as i32,
            muted,
            eof,
            tracks: vec![],
            chapters: vec![],
            chapter: None,
            secondary_sub_id,
            sub_delay_ms: (sub_delay * 1000.0) as i64,
            sub_scale,
            network_bps,
            video_codec,
            audio_codec,
            video_params: None,
            audio_params: None,
            hwdec_current,
            container_fps,
            estimated_vf_fps,
            video_bitrate: video_bitrate.map(|v| v as f64),
            audio_bitrate: audio_bitrate.map(|v| v as f64),
            frame_drop_count: frame_drop_count.map(|v| v as f64),
            decoder_frame_drop_count: decoder_frame_drop_count.map(|v| v as f64),
            vo_frame_drop_count: vo_frame_drop_count.map(|v| v as f64),
        })
    }

    async fn shutdown(&self) -> AppResult<()> {
        if let Some(h) = self.host.read().as_ref() {
            let _ = h.show(false);
        }
        Ok(())
    }
}

// Allow downcasting through a thin "EmbeddedHandle" so the manager can route
// bind/rect calls to the embedded backend without exposing the concrete type
// everywhere.
pub trait EmbeddedHandle: MpvBackend {
    fn bind(&self, parent: ParentHandle) -> AppResult<()>;
    fn set_rect(&self, rect: PlayerRect) -> AppResult<()>;
    fn set_visible(&self, visible: bool) -> AppResult<()>;
}

impl EmbeddedHandle for MpvEmbeddedBackend {
    fn bind(&self, parent: ParentHandle) -> AppResult<()> {
        self.bind_window(parent)
    }
    fn set_rect(&self, rect: PlayerRect) -> AppResult<()> {
        self.set_rect(rect)
    }
    fn set_visible(&self, visible: bool) -> AppResult<()> {
        self.set_visible(visible)
    }
}

#[allow(dead_code)]
fn touch(_: TrackKind, _: MpvTrackInfo, _: MpvChapterInfo) {}
