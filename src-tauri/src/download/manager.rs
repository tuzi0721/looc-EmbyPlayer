use std::path::PathBuf;
use std::sync::Arc;

use dashmap::DashMap;
use tauri::{AppHandle, Manager};
use tokio::sync::watch;
use tokio::task::JoinHandle;

use crate::config::ConfigStore;
use crate::download::engine::{ControlSignal, DownloadEngine};
use crate::download::task::{DownloadStatus, DownloadTask};
use crate::emby::EmbyClient;
use crate::error::{AppError, AppResult};
use crate::notifications::NotificationCenter;

#[derive(Clone)]
pub struct DownloadManager {
    engine: Arc<DownloadEngine>,
    handles: Arc<DashMap<String, ActiveHandle>>,
    handle: AppHandle,
}

struct ActiveHandle {
    control_tx: watch::Sender<ControlSignal>,
    join: JoinHandle<AppResult<()>>,
}

impl DownloadManager {
    pub fn new(
        config: ConfigStore,
        emby: EmbyClient,
        handle: AppHandle,
        notifications: NotificationCenter,
    ) -> Self {
        Self {
            engine: Arc::new(DownloadEngine::new(
                config,
                emby,
                handle.clone(),
                notifications,
            )),
            handles: Arc::new(DashMap::new()),
            handle,
        }
    }

    pub fn download_dir(&self) -> AppResult<PathBuf> {
        let base = self
            .handle
            .path()
            .app_data_dir()
            .map_err(|e| AppError::Other(format!("data dir: {e}")))?;
        let settings = self.engine.config.settings();
        let dir = settings
            .download_directory
            .as_deref()
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .map(PathBuf::from)
            .map(|path| {
                if path.is_absolute() {
                    path
                } else {
                    base.join(path)
                }
            })
            .unwrap_or_else(|| base.join("downloads"));
        std::fs::create_dir_all(&dir)?;
        Ok(dir)
    }

    pub fn start(&self, task: DownloadTask) -> AppResult<DownloadTask> {
        // Persist initial task.
        self.engine.config.upsert_download(task.clone())?;
        self.spawn(task.clone())?;
        Ok(task)
    }

    pub fn pause(&self, id: &str) -> AppResult<()> {
        if let Some(h) = self.handles.get(id) {
            let _ = h.control_tx.send(ControlSignal::Pause);
        }
        Ok(())
    }

    pub fn resume(&self, id: &str) -> AppResult<()> {
        // If task isn't running, spawn it again.
        if !self.handles.contains_key(id) {
            if let Some(task) = self.engine.config.download(id) {
                self.spawn(task)?;
                return Ok(());
            }
        }
        if let Some(h) = self.handles.get(id) {
            let _ = h.control_tx.send(ControlSignal::Run);
        }
        Ok(())
    }

    pub fn cancel(&self, id: &str) -> AppResult<()> {
        if let Some(h) = self.handles.get(id) {
            let _ = h.control_tx.send(ControlSignal::Cancel);
        }
        Ok(())
    }

    pub fn remove(&self, id: &str, delete_file: bool) -> AppResult<()> {
        self.cancel(id)?;
        if let Some((_, h)) = self.handles.remove(id) {
            h.join.abort();
        }
        if delete_file {
            if let Some(task) = self.engine.config.download(id) {
                if std::path::Path::new(&task.file_path).exists() {
                    let _ = std::fs::remove_file(&task.file_path);
                }
            }
        }
        self.engine.config.remove_download(id)?;
        Ok(())
    }

    pub fn list(&self) -> Vec<DownloadTask> {
        self.engine.config.downloads()
    }

    pub fn get(&self, id: &str) -> Option<DownloadTask> {
        self.engine.config.download(id)
    }

    /// Resume any tasks that were Running/Paused when the app last exited.
    pub fn resume_persisted(&self) {
        for task in self.engine.config.downloads() {
            if matches!(task.status, DownloadStatus::Running) {
                let _ = self.spawn(task);
            }
        }
    }

    fn spawn(&self, task: DownloadTask) -> AppResult<()> {
        let (tx, rx) = watch::channel(ControlSignal::Run);
        let engine = self.engine.clone();
        let task_id = task.id.clone();
        let handles = self.handles.clone();

        let join = tokio::spawn(async move {
            let result = engine.run_task(task_id.clone(), rx).await;
            handles.remove(&task_id);
            result
        });

        self.handles.insert(
            task.id.clone(),
            ActiveHandle {
                control_tx: tx,
                join,
            },
        );
        Ok(())
    }
}
