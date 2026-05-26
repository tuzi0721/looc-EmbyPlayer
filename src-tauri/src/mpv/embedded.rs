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
use crate::mpv::backend::{MpvBackend, MpvCommand, MpvSnapshot, TrackKind, MpvTrackInfo};
use crate::mpv::window_host::{HostWindow, ParentHandle, PlayerRect};

pub struct MpvEmbeddedBackend {
    mpv: Arc<Mutex<Mpv>>,
    host: Arc<RwLock<Option<HostWindow>>>,
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
            MpvCommand::Load { url, headers, user_agent, start_ms, stream_record_path } => {
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
            MpvCommand::SetAudioTrack(id) => m
                .set_property("aid", id)
                .map_err(|e| AppError::Mpv(e.to_string())),
            MpvCommand::SetSubtitleTrack(None) => m
                .set_property("sid", "no")
                .map_err(|e| AppError::Mpv(e.to_string())),
            MpvCommand::SetSubtitleTrack(Some(id)) => m
                .set_property("sid", id)
                .map_err(|e| AppError::Mpv(e.to_string())),
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
            MpvCommand::CycleSubtitle => m
                .command("cycle", &["sub"])
                .map_err(|e| AppError::Mpv(e.to_string())),
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
        let sub_delay: f64 = m.get_property("sub-delay").unwrap_or(0.0);
        let sub_scale: f64 = m.get_property("sub-scale").unwrap_or(1.0);

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
            sub_delay_ms: (sub_delay * 1000.0) as i64,
            sub_scale,
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
fn touch(_: TrackKind, _: MpvTrackInfo) {}
