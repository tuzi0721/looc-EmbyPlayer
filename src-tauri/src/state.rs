use std::sync::Arc;

use tauri::AppHandle;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use crate::commands::shortcuts::ShortcutRegistry;
#[cfg(feature = "mpv-embedded")]
use crate::config::models::MpvBackendKind;
use crate::config::ConfigStore;
use crate::download::DownloadManager;
use crate::emby::{EmbyClient, EmbySocket, SessionController};
use crate::error::AppResult;
use crate::mp4_prefetch::PrefetchManager;
use crate::mpv::MpvManager;
use crate::network::{build_client, HealthScheduler, HeartbeatScheduler};
use crate::notifications::NotificationCenter;
use crate::stream_proxy::StreamProxy;
use crate::system_media::SystemMediaController;

/// Global, cloneable app state held inside Tauri's managed state.
pub struct AppState {
    pub handle: AppHandle,
    pub config: ConfigStore,
    pub emby: EmbyClient,
    pub mpv: MpvManager,
    /// Parallel standalone (independent-window) mpv playback mode. Kept beside
    /// the embedded `mpv` manager so both modes can coexist (see T2 / docs).
    pub standalone: crate::mpv::StandalonePlayer,
    pub downloads: DownloadManager,
    pub notifications: NotificationCenter,
    pub stream_proxy: StreamProxy,
    pub prefetch: PrefetchManager,
    pub session_controller: Arc<SessionController>,
    pub shortcuts: ShortcutRegistry,
    pub system_media: Arc<SystemMediaController>,
    pub heartbeat: Mutex<Option<Arc<HeartbeatScheduler>>>,
    pub health: Mutex<Option<Arc<HealthScheduler>>>,
    pub socket: Mutex<Option<Arc<EmbySocket>>>,
    pub socket_task: Mutex<Option<JoinHandle<()>>>,
    pub current_play_session: Mutex<Option<CurrentPlaySession>>,
}

#[derive(Clone, Debug)]
pub struct CurrentPlaySession {
    pub server_id: String,
    pub account_id: String,
    pub item_id: String,
    pub play_session_id: String,
    pub media_source_id: String,
    pub play_method: String,
    pub line_id: String,
    /// When set, the playback is also writing to a local file via mpv's
    /// `--stream-record` (watch-while-download). The id maps to a
    /// `DownloadTask` that needs to be finalized when playback stops.
    pub record_task_id: Option<String>,
}

impl AppState {
    pub fn initialize(handle: AppHandle) -> AppResult<Self> {
        let config = ConfigStore::load(&handle)?;
        #[cfg(feature = "mpv-embedded")]
        config.update_settings(|s| {
            s.mpv_backend = MpvBackendKind::Embedded;
        })?;
        let settings = config.settings();
        let http = build_client(&settings)?;
        let emby = EmbyClient::new(http, config.clone());
        let mpv = MpvManager::new(&settings)?;
        let standalone = crate::mpv::StandalonePlayer::new(emby.clone());
        let notifications = NotificationCenter::new(config.clone(), handle.clone());
        let stream_proxy = StreamProxy::new()?;
        let prefetch = PrefetchManager::new()?;
        let downloads = DownloadManager::new(
            config.clone(),
            emby.clone(),
            handle.clone(),
            notifications.clone(),
        );
        let session_controller = Arc::new(SessionController::new(
            config.clone(),
            emby.clone(),
            mpv.clone(),
            notifications.clone(),
            handle.clone(),
        ));

        Ok(Self {
            handle,
            config,
            emby,
            mpv,
            standalone,
            downloads,
            notifications,
            stream_proxy,
            prefetch,
            session_controller,
            shortcuts: ShortcutRegistry::default(),
            system_media: Arc::new(SystemMediaController::new()),
            heartbeat: Mutex::new(None),
            health: Mutex::new(None),
            socket: Mutex::new(None),
            socket_task: Mutex::new(None),
            current_play_session: Mutex::new(None),
        })
    }

    pub async fn spawn_background_workers(self: Arc<Self>) {
        let heartbeat = HeartbeatScheduler::new(
            self.config.clone(),
            self.emby.clone(),
            self.notifications.clone(),
        );
        *self.heartbeat.lock().await = Some(heartbeat.clone());
        tokio::spawn(heartbeat.run());

        let health = HealthScheduler::new(
            self.config.clone(),
            self.emby.clone(),
            self.handle.clone(),
            self.notifications.clone(),
        );
        *self.health.lock().await = Some(health.clone());
        tokio::spawn(health.run());

        // Resume downloads that were running when the app last exited.
        self.downloads.resume_persisted();

        let _ = self.restart_socket().await;
    }

    pub async fn shutdown_playback(&self) {
        let backend = self.mpv.backend();
        if let Err(e) = backend.shutdown().await {
            tracing::warn!(target = "mpv", error = %e, "mpv shutdown during app exit failed");
        }
        let _ = self.standalone.stop().await;
        let _ = self.current_play_session.lock().await.take();
        self.stream_proxy.clear();
        self.prefetch.cancel();
        self.system_media.clear();
    }

    /// (Re)start the Emby WebSocket session bound to the active account. If
    /// there is no active account, this stops any running session.
    pub async fn restart_socket(self: &Arc<Self>) -> AppResult<()> {
        // Stop any current session.
        if let Some(prev) = self.socket.lock().await.take() {
            prev.shutdown();
        }
        if let Some(task) = self.socket_task.lock().await.take() {
            task.abort();
        }

        let Some(account) = self.config.active_account() else {
            return Ok(());
        };
        let Some(server) = self.config.server(&account.server_id) else {
            return Ok(());
        };

        let socket = EmbySocket::new(self.handle.clone());
        *self.socket.lock().await = Some(socket.clone());

        let emby = self.emby.clone();
        let controller = self.session_controller.clone();
        let task = tokio::spawn(async move {
            if let Err(e) = socket.run(server, account, emby, Some(controller)).await {
                tracing::warn!(target = "emby-socket", error = %e, "socket task ended");
            }
        });
        *self.socket_task.lock().await = Some(task);
        Ok(())
    }
}
