use std::sync::Arc;

use parking_lot::RwLock;

use crate::config::models::{AppSettings, MpvBackendKind};
use crate::error::{AppError, AppResult};
use crate::mpv::backend::MpvBackend;
use crate::mpv::ipc::MpvIpcBackend;
use crate::mpv::window_host::{ParentHandle, PlayerRect};

#[cfg(feature = "mpv-embedded")]
use crate::mpv::embedded::{EmbeddedHandle, MpvEmbeddedBackend};

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
        let g = self.inner.read();
        #[cfg(feature = "mpv-embedded")]
        if let Some(e) = g.embedded.as_ref() {
            return e.bind(parent);
        }
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
                return e.set_visible(false);
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
            })
        }
        MpvBackendKind::Embedded => {
            #[cfg(feature = "mpv-embedded")]
            {
                let e = Arc::new(MpvEmbeddedBackend::new()?);
                let backend: Arc<dyn MpvBackend> = e.clone();
                Ok(Slot {
                    backend,
                    ipc: None,
                    embedded: Some(e),
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
