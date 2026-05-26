use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;
use tokio::time::interval;

use crate::config::models::LineStatus;
use crate::config::ConfigStore;
use crate::emby::EmbyClient;
use crate::error::AppResult;
use crate::network::health::apply_report_to_line;
use crate::notifications::{
    NotificationCategory, NotificationCenter, NotificationKind, NotificationSpec,
};

/// Periodic line health-check across all servers. Reports are persisted onto
/// `Line.last_*` fields. When `auto_failover` is enabled, the server's active
/// line is updated to the best candidate after each pass.
pub struct HealthScheduler {
    config: ConfigStore,
    client: EmbyClient,
    handle: AppHandle,
    notifications: NotificationCenter,
    shutdown_tx: broadcast::Sender<()>,
    /// Tracks per-server "all lines down" state so we only push the warning
    /// notification on transitions, not every tick.
    all_down: Mutex<HashMap<String, bool>>,
}

const EVENT_HEALTH_TICK: &str = "lines:health-tick";

impl HealthScheduler {
    pub fn new(
        config: ConfigStore,
        client: EmbyClient,
        handle: AppHandle,
        notifications: NotificationCenter,
    ) -> Arc<Self> {
        let (tx, _rx) = broadcast::channel(1);
        Arc::new(Self {
            config,
            client,
            handle,
            notifications,
            shutdown_tx: tx,
            all_down: Mutex::new(HashMap::new()),
        })
    }

    pub async fn run(self: Arc<Self>) {
        let mut rx = self.shutdown_tx.subscribe();
        let interval_secs = self.config.settings().health_check_interval_secs.max(15);
        let mut ticker = interval(Duration::from_secs(interval_secs));
        ticker.tick().await;

        loop {
            tokio::select! {
                _ = ticker.tick() => {
                    if let Err(e) = self.tick_once().await {
                        tracing::warn!(target = "health", error = %e, "tick failed");
                    }
                }
                _ = rx.recv() => {
                    tracing::info!("health-scheduler: shutting down");
                    break;
                }
            }
        }
    }

    pub fn shutdown(&self) {
        let _ = self.shutdown_tx.send(());
    }

    async fn tick_once(&self) -> AppResult<()> {
        let settings = self.config.settings();
        let checker = self.client.health_checker();

        for mut server in self.config.servers() {
            let default_ua = server
                .default_user_agent
                .clone()
                .unwrap_or(settings.default_user_agent.clone());
            let prev_active = server.active_line_id.clone();
            let reports = checker.check_all(&server.lines, &default_ua).await;
            for r in &reports {
                if let Some(line) = server.lines.iter_mut().find(|l| l.id == r.line_id) {
                    apply_report_to_line(line, r);
                }
            }
            if server.auto_failover {
                if let Some(best) = best_line_id(&server) {
                    server.active_line_id = Some(best);
                }
            }

            self.maybe_notify_failover(&server, prev_active.as_deref());
            self.maybe_notify_all_down(&server);

            let _ = self.config.upsert_server(server.clone());

            let _ = self.handle.emit(
                EVENT_HEALTH_TICK,
                serde_json::json!({
                    "serverId": server.id,
                    "timestamp": Utc::now(),
                    "reports": reports,
                }),
            );
        }
        Ok(())
    }

    fn maybe_notify_failover(
        &self,
        server: &crate::config::models::Server,
        prev_active: Option<&str>,
    ) {
        let new_active = server.active_line_id.as_deref();
        if prev_active == new_active {
            return;
        }
        let Some(new_id) = new_active else { return };
        // Only notify when auto-failover actually changed the active line.
        if !server.auto_failover {
            return;
        }
        let new_line_name = server
            .lines
            .iter()
            .find(|l| l.id == new_id)
            .map(|l| l.name.clone())
            .unwrap_or_else(|| new_id.to_string());
        let _ = self.notifications.push(
            NotificationSpec::new(
                NotificationKind::Info,
                NotificationCategory::Server,
                format!("{} 已切换线路", server.name),
            )
            .body(format!("当前线路: {new_line_name}"))
            .source(server.id.clone()),
        );
    }

    fn maybe_notify_all_down(&self, server: &crate::config::models::Server) {
        let all_down = !server.lines.is_empty()
            && server
                .lines
                .iter()
                .filter(|l| l.enabled)
                .all(|l| matches!(l.last_status, Some(LineStatus::Down)));

        let mut g = self.all_down.lock();
        let was_down = g.get(&server.id).copied().unwrap_or(false);
        if all_down == was_down {
            return;
        }
        g.insert(server.id.clone(), all_down);
        drop(g);

        if all_down {
            let _ = self.notifications.push(
                NotificationSpec::new(
                    NotificationKind::Error,
                    NotificationCategory::Server,
                    format!("{} 全部线路不可用", server.name),
                )
                .body("请检查网络或登录设置")
                .sticky()
                .source(server.id.clone()),
            );
        } else {
            let _ = self.notifications.push(
                NotificationSpec::new(
                    NotificationKind::Success,
                    NotificationCategory::Server,
                    format!("{} 线路已恢复", server.name),
                )
                .source(server.id.clone()),
            );
        }
    }
}

fn best_line_id(server: &crate::config::models::Server) -> Option<String> {
    use crate::config::models::LineStatus;
    let mut candidates: Vec<&crate::config::models::Line> = server
        .lines
        .iter()
        .filter(|l| {
            l.enabled
                && l.last_status
                    .map(|s| !matches!(s, LineStatus::Down))
                    .unwrap_or(true)
        })
        .collect();
    candidates.sort_by_key(|l| (l.priority, l.last_latency_ms.unwrap_or(u32::MAX)));
    candidates.first().map(|l| l.id.clone())
}
