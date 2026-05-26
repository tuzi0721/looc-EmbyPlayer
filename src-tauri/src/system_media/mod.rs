//! System-level media integration. On Windows this drives the SMTC
//! (`SystemMediaTransportControls`) panel that the Windows shell uses to show
//! "Now Playing" widgets and to route media-key events. On other platforms
//! these calls degrade to no-ops.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::error::AppResult;

#[cfg(target_os = "windows")]
mod windows_smtc;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PlaybackStatus {
    Stopped,
    Playing,
    Paused,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NowPlayingInfo {
    pub title: String,
    #[serde(default)]
    pub subtitle: Option<String>,
    #[serde(default)]
    pub artist: Option<String>,
    #[serde(default)]
    pub album: Option<String>,
    /// Total duration in milliseconds.
    #[serde(default)]
    pub duration_ms: Option<i64>,
    /// Current position in milliseconds.
    #[serde(default)]
    pub position_ms: Option<i64>,
    /// HTTP URL to a poster/backdrop image. The backend fetches and forwards
    /// it to the OS shell.
    #[serde(default)]
    pub thumbnail_url: Option<String>,
}

#[cfg(target_os = "windows")]
pub struct SystemMediaController {
    inner: parking_lot::Mutex<Option<windows_smtc::WindowsSmtc>>,
}

#[cfg(not(target_os = "windows"))]
pub struct SystemMediaController {
    _marker: std::marker::PhantomData<()>,
}

impl SystemMediaController {
    pub fn new() -> Self {
        #[cfg(target_os = "windows")]
        {
            Self {
                inner: parking_lot::Mutex::new(None),
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            Self {
                _marker: std::marker::PhantomData,
            }
        }
    }

    /// Attach SMTC to the main window. Must be called once the main window
    /// exists. Idempotent (calling twice replaces the previous handle).
    pub fn attach(&self, handle: AppHandle) -> AppResult<()> {
        #[cfg(target_os = "windows")]
        {
            let smtc = windows_smtc::WindowsSmtc::new(handle)?;
            *self.inner.lock() = Some(smtc);
            Ok(())
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = handle;
            Ok(())
        }
    }

    pub fn update_metadata(&self, info: &NowPlayingInfo) {
        #[cfg(target_os = "windows")]
        {
            if let Some(s) = self.inner.lock().as_ref() {
                if let Err(e) = s.update_metadata(info) {
                    tracing::warn!(target = "smtc", error = %e, "update_metadata failed");
                }
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = info;
        }
    }

    pub fn update_playback(&self, status: PlaybackStatus) {
        #[cfg(target_os = "windows")]
        {
            if let Some(s) = self.inner.lock().as_ref() {
                if let Err(e) = s.update_playback(status) {
                    tracing::warn!(target = "smtc", error = %e, "update_playback failed");
                }
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = status;
        }
    }

    pub fn update_position(&self, position_ms: i64, duration_ms: i64) {
        #[cfg(target_os = "windows")]
        {
            if let Some(s) = self.inner.lock().as_ref() {
                if let Err(e) = s.update_position(position_ms, duration_ms) {
                    tracing::warn!(target = "smtc", error = %e, "update_position failed");
                }
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = (position_ms, duration_ms);
        }
    }

    pub fn clear(&self) {
        #[cfg(target_os = "windows")]
        {
            if let Some(s) = self.inner.lock().as_ref() {
                if let Err(e) = s.clear() {
                    tracing::warn!(target = "smtc", error = %e, "clear failed");
                }
            }
        }
    }
}

impl Default for SystemMediaController {
    fn default() -> Self {
        Self::new()
    }
}
