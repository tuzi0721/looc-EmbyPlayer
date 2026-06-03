use std::sync::Arc;

use parking_lot::RwLock;

use crate::config::models::{AppSettings, MpvBackendKind};
use crate::error::{AppError, AppResult};
use crate::mpv::backend::MpvBackend;
use crate::mpv::ipc::MpvIpcBackend;
use crate::mpv::window_host::{ParentHandle, PlayerRect};

#[cfg(feature = "mpv-embedded")]
use crate::mpv::embedded::{log_visual_mpv_event, EmbeddedHandle, MpvEmbeddedBackend};

#[derive(Clone)]
pub struct MpvManager {
    inner: Arc<RwLock<Slot>>,
}

#[derive(Clone)]
struct Slot {
    backend: Arc<dyn MpvBackend>,
    ipc: Option<Arc<MpvIpcBackend>>,
    #[cfg(feature = "mpv-embedded")]
    embedded: Option<Arc<MpvEmbeddedBackend>>,
    #[cfg(feature = "mpv-embedded")]
    prefer_embedded: bool,
}

impl MpvManager {
    pub fn new(settings: &AppSettings) -> AppResult<Self> {
        let slot = build_slot(settings)?;
        Ok(Self {
            inner: Arc::new(RwLock::new(slot)),
        })
    }

    pub fn backend(&self) -> Arc<dyn MpvBackend> {
        self.inner.read().backend.clone()
    }

    pub async fn rebuild(&self, settings: &AppSettings) -> AppResult<()> {
        let new_slot = build_slot(settings)?;
        let old = std::mem::replace(&mut *self.inner.write(), new_slot);
        let _ = old.backend.shutdown().await;
        Ok(())
    }

    pub fn bind_embedded(&self, parent: ParentHandle) -> AppResult<()> {
        #[cfg(feature = "mpv-embedded")]
        {
            let (existing, prefer_embedded) = {
                let g = self.inner.read();
                (g.embedded.clone(), g.prefer_embedded)
            };
            if let Some(e) = existing {
                log_visual_mpv_event("manager:bind-existing-start");
                let result = e.bind(parent);
                log_visual_mpv_event(if result.is_ok() {
                    "manager:bind-existing-complete"
                } else {
                    "manager:bind-existing-error"
                });
                return result;
            }
            if prefer_embedded {
                log_visual_mpv_event("manager:lazy-new-start");
                let embedded = Arc::new(MpvEmbeddedBackend::new()?);
                log_visual_mpv_event("manager:lazy-new-complete");
                log_visual_mpv_event("manager:lazy-bind-start");
                embedded.bind(parent)?;
                log_visual_mpv_event("manager:lazy-bind-complete");
                let mut g = self.inner.write();
                if let Some(existing) = g.embedded.as_ref() {
                    log_visual_mpv_event("manager:lazy-race-existing-start");
                    return existing.bind(parent);
                }
                g.backend = embedded.clone();
                g.embedded = Some(embedded);
                g.ipc = None;
                log_visual_mpv_event("manager:lazy-installed");
                return Ok(());
            }
        }
        let g = self.inner.read();
        if let Some(ipc) = g.ipc.as_ref() {
            return ipc.bind_embedded(parent);
        }
        let _ = parent;
        Err(AppError::Mpv("no mpv backend available".into()))
    }

    pub fn embed_rect(&self, rect: PlayerRect) -> AppResult<()> {
        let g = self.inner.read();
        #[cfg(feature = "mpv-embedded")]
        if let Some(e) = g.embedded.as_ref() {
            return e.set_rect(rect);
        }
        if let Some(ipc) = g.ipc.as_ref() {
            return ipc.embed_rect(rect);
        }
        let _ = rect;
        Ok(())
    }

    pub fn embed_show(&self, visible: bool) -> AppResult<()> {
        let g = self.inner.read();
        #[cfg(feature = "mpv-embedded")]
        if let Some(e) = g.embedded.as_ref() {
            return e.set_visible(visible);
        }
        if let Some(ipc) = g.ipc.as_ref() {
            return ipc.embed_show(visible);
        }
        let _ = visible;
        Ok(())
    }

    pub async fn detach_embedded(&self) -> AppResult<()> {
        let ipc = self.inner.read().ipc.clone();
        #[cfg(feature = "mpv-embedded")]
        {
            let embedded = self.inner.read().embedded.clone();
            if let Some(e) = embedded {
                return e.detach();
            }
        }
        if let Some(ipc) = ipc {
            return ipc.detach_embedded().await;
        }
        Ok(())
    }
}

fn build_slot(settings: &AppSettings) -> AppResult<Slot> {
    match settings.mpv_backend {
        MpvBackendKind::Ipc => {
            let ipc = Arc::new(MpvIpcBackend::new(settings.clone()));
            Ok(Slot {
                backend: ipc.clone(),
                ipc: Some(ipc),
                #[cfg(feature = "mpv-embedded")]
                embedded: None,
                #[cfg(feature = "mpv-embedded")]
                prefer_embedded: false,
            })
        }
        MpvBackendKind::Embedded => {
            #[cfg(feature = "mpv-embedded")]
            {
                // Creating libmpv during Tauri setup can block the WebView from
                // ever navigating away from about:blank on some Windows hosts.
                // Keep startup light and instantiate libmpv on embed_attach.
                let ipc = Arc::new(MpvIpcBackend::new(settings.clone()));
                Ok(Slot {
                    backend: ipc.clone(),
                    ipc: Some(ipc),
                    embedded: None,
                    prefer_embedded: true,
                })
            }
            #[cfg(not(feature = "mpv-embedded"))]
            {
                Err(AppError::Mpv(
                    "embedded backend not compiled (enable feature `mpv-embedded`)".into(),
                ))
            }
        }
    }
}
