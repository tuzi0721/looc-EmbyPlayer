use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use tokio::sync::broadcast;
use tokio::task::JoinHandle;
use tokio::time::interval;

use crate::config::models::{Account, Server};
use crate::emby::models::PlaybackProgress;
use crate::emby::EmbyClient;

/// While a stealth download is running we periodically tell the Emby server
/// "we are still watching" so the session looks indistinguishable from a
/// normal playback. We slowly advance a virtual playhead by the report
/// interval. Downloads run faster than playback so this is intentionally not
/// tied to actual bytes downloaded.
pub struct StealthReporter {
    shutdown_tx: broadcast::Sender<()>,
    task: Mutex<Option<JoinHandle<()>>>,
    virtual_ticks: Arc<AtomicI64>,
}

impl StealthReporter {
    pub fn start(
        emby: EmbyClient,
        server: Server,
        account: Account,
        item_id: String,
        play_session_id: String,
        interval_secs: u64,
    ) -> Arc<Self> {
        let (tx, _) = broadcast::channel(1);
        let virtual_ticks = Arc::new(AtomicI64::new(0));
        let me = Arc::new(Self {
            shutdown_tx: tx.clone(),
            task: Mutex::new(None),
            virtual_ticks: virtual_ticks.clone(),
        });

        let mut rx = tx.subscribe();
        let task = tokio::spawn(async move {
            let mut tick = interval(Duration::from_secs(interval_secs.max(5)));
            tick.tick().await;
            loop {
                tokio::select! {
                    _ = tick.tick() => {
                        let pos = virtual_ticks
                            .fetch_add((interval_secs as i64) * 10_000_000, Ordering::Relaxed)
                            + (interval_secs as i64) * 10_000_000;
                        let p = PlaybackProgress {
                            item_id: item_id.clone(),
                            play_session_id: play_session_id.clone(),
                            position_ticks: pos,
                            is_paused: false,
                            play_method: "DirectStream".into(),
                            volume_level: 100,
                        };
                        if let Err(e) = emby.report_progress(&server, &account, &p).await {
                            tracing::debug!(target = "stealth", error = %e, "report_progress");
                        }
                    }
                    _ = rx.recv() => break,
                }
            }
        });
        *me.task.lock() = Some(task);
        me
    }

    /// Current synthetic playhead in Emby ticks (10 000 000 per second).
    pub fn virtual_ticks(&self) -> i64 {
        self.virtual_ticks.load(Ordering::Relaxed)
    }

    pub async fn stop(self: Arc<Self>) {
        let _ = self.shutdown_tx.send(());
        if let Some(handle) = self.task.lock().take() {
            handle.abort();
        }
    }
}
