use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use tokio::sync::broadcast;
use tokio::time::interval;

use crate::config::ConfigStore;
use crate::emby::EmbyClient;
use crate::error::{AppError, AppResult};
use crate::notifications::{
    NotificationCategory, NotificationCenter, NotificationKind, NotificationSpec,
};
use serde_json::json;

/// Periodic keep-alive that pings the active session so the Emby/Jellyfin server
/// keeps the account marked online (auto 保号).
pub struct HeartbeatScheduler {
    config: ConfigStore,
    client: EmbyClient,
    notifications: NotificationCenter,
    shutdown_tx: broadcast::Sender<()>,
    /// Tracks the last account id we already alerted about so we don't spam.
    auth_notified: Mutex<Option<String>>,
}

impl HeartbeatScheduler {
    pub fn new(
        config: ConfigStore,
        client: EmbyClient,
        notifications: NotificationCenter,
    ) -> Arc<Self> {
        let (tx, _rx) = broadcast::channel(1);
        Arc::new(Self {
            config,
            client,
            notifications,
            shutdown_tx: tx,
            auth_notified: Mutex::new(None),
        })
    }

    /// Run the heartbeat loop until shutdown is signalled.
    pub async fn run(self: Arc<Self>) {
        let mut rx = self.shutdown_tx.subscribe();
        let interval_secs = self.config.settings().heartbeat_interval_secs.max(30);
        let mut ticker = interval(Duration::from_secs(interval_secs));
        ticker.tick().await;

        loop {
            tokio::select! {
                _ = ticker.tick() => {
                    if let Err(e) = self.tick_once().await {
                        tracing::warn!(target = "heartbeat", error = %e, "heartbeat tick failed");
                    }
                }
                _ = rx.recv() => {
                    tracing::info!("heartbeat: shutting down");
                    break;
                }
            }
        }
    }

    pub fn shutdown(&self) {
        let _ = self.shutdown_tx.send(());
    }

    async fn tick_once(&self) -> AppResult<()> {
        let Some(account) = self.config.active_account() else {
            return Ok(());
        };
        let Some(server) = self.config.server(&account.server_id) else {
            return Ok(());
        };
        match self.client.ping_keepalive(&server, &account).await {
            Ok(report) => {
                tracing::debug!(target = "heartbeat", server = %server.name, ok = report, "keepalive");
                // Auth recovered; clear the latch so future failures notify again.
                *self.auth_notified.lock() = None;
                Ok(())
            }
            Err(AppError::Auth(body)) => {
                let mut g = self.auth_notified.lock();
                if g.as_deref() != Some(account.id.as_str()) {
                    *g = Some(account.id.clone());
                    drop(g);
                    let _ = self.notifications.push(
                        NotificationSpec::new(
                            NotificationKind::Error,
                            NotificationCategory::Auth,
                            format!("{} 登录已失效", account.username),
                        )
                        .body(format!("请重新登录 {} 以继续使用", server.name))
                        .action(crate::notifications::NotificationAction {
                            kind: "navigate".to_string(),
                            label: "去登录".to_string(),
                            payload: json!({ "route": "/login" }),
                        })
                        .sticky()
                        .source(account.id.clone()),
                    );
                }
                Err(AppError::Auth(body))
            }
            Err(e) => Err(e),
        }
    }
}
