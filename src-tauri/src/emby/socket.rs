use std::sync::Arc;
use std::time::Duration;

use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;
use tokio::time::interval;
use tokio_tungstenite::tungstenite::Message;
use url::Url;

use crate::config::models::{Account, Server};
use crate::emby::session_controller::SessionController;
use crate::emby::EmbyClient;
use crate::error::{AppError, AppResult};

const EVENT_SESSIONS: &str = "emby:session";
const EVENT_CONNECTED: &str = "emby:socket-connected";
const EVENT_DISCONNECTED: &str = "emby:socket-disconnected";
const HEARTBEAT_INTERVAL_SECS: u64 = 30;

/// Emby/Jellyfin WebSocket session, used to receive server-pushed events such
/// as session list updates, restart prompts, and remote-control messages from
/// other devices that watch the same library.
pub struct EmbySocket {
    handle: AppHandle,
    shutdown_tx: broadcast::Sender<()>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SocketEvent {
    pub server_id: String,
    pub message_type: String,
    pub payload: Value,
}

impl EmbySocket {
    pub fn new(handle: AppHandle) -> Arc<Self> {
        let (tx, _) = broadcast::channel(1);
        Arc::new(Self {
            handle,
            shutdown_tx: tx,
        })
    }

    pub fn shutdown(&self) {
        let _ = self.shutdown_tx.send(());
    }

    /// Run a single WebSocket connection. The caller is expected to relaunch
    /// this future when the active account/server changes. `controller` is
    /// invoked for inbound remote-control messages; pass `None` to ignore.
    pub async fn run(
        self: Arc<Self>,
        server: Server,
        account: Account,
        emby: EmbyClient,
        controller: Option<Arc<SessionController>>,
    ) -> AppResult<()> {
        let active_line = server
            .lines
            .iter()
            .find(|l| Some(&l.id) == server.active_line_id.as_ref())
            .or_else(|| server.lines.first())
            .ok_or_else(|| AppError::NoLine(server.id.clone()))?;

        let mut base = Url::parse(&active_line.base_url)?;
        let ws_scheme = match base.scheme() {
            "https" => "wss",
            "http" => "ws",
            other => return Err(AppError::Other(format!("unsupported scheme {other}"))),
        };
        base.set_scheme(ws_scheme)
            .map_err(|_| AppError::Other("set scheme".into()))?;
        let mut url = base.join("socket")?;
        url.query_pairs_mut()
            .append_pair("api_key", &account.access_token)
            .append_pair("deviceId", "emby-player-desktop-001");

        tracing::info!(target = "emby-socket", "connecting to {url}");

        let (mut ws, _resp) = tokio_tungstenite::connect_async(url.as_str())
            .await
            .map_err(|e| AppError::Other(format!("ws connect: {e}")))?;

        let _ = self.handle.emit(EVENT_CONNECTED, &server.id);

        // Subscribe to session updates as soon as connected.
        let sub = serde_json::json!({
            "MessageType": "SessionsStart",
            "Data": "0,1500"
        })
        .to_string();
        ws.send(Message::Text(sub)).await.ok();

        // Tell the server we can be controlled.
        if let Err(e) = emby.report_capabilities(&server, &account).await {
            tracing::warn!(target = "emby-socket", error = %e, "report_capabilities failed");
        }

        let mut rx = self.shutdown_tx.subscribe();
        let mut hb = interval(Duration::from_secs(HEARTBEAT_INTERVAL_SECS));
        hb.tick().await;

        let server_id = server.id.clone();
        loop {
            tokio::select! {
                msg = ws.next() => {
                    match msg {
                        Some(Ok(Message::Text(text))) => {
                            if let Ok(v) = serde_json::from_str::<Value>(&text) {
                                let mtype = v.get("MessageType")
                                    .and_then(Value::as_str)
                                    .unwrap_or("Unknown")
                                    .to_string();
                                let payload = v.get("Data").cloned().unwrap_or(Value::Null);
                                let ev = SocketEvent {
                                    server_id: server_id.clone(),
                                    message_type: mtype.clone(),
                                    payload: payload.clone(),
                                };
                                let _ = self.handle.emit(EVENT_SESSIONS, &ev);

                                if let Some(ctrl) = controller.as_ref() {
                                    if matches!(
                                        mtype.as_str(),
                                        "Playstate" | "GeneralCommand" | "Play"
                                    ) {
                                        let ctrl = ctrl.clone();
                                        let server_c = server.clone();
                                        let account_c = account.clone();
                                        let ev_c = ev.clone();
                                        tokio::spawn(async move {
                                            ctrl.handle(&server_c, &account_c, ev_c).await;
                                        });
                                    }
                                }
                            }
                        }
                        Some(Ok(Message::Ping(p))) => {
                            let _ = ws.send(Message::Pong(p)).await;
                        }
                        Some(Ok(Message::Close(_))) => {
                            tracing::info!("emby socket closed");
                            break;
                        }
                        Some(Err(e)) => {
                            tracing::warn!("emby socket error: {e}");
                            break;
                        }
                        Some(Ok(_)) => {}
                        None => break,
                    }
                }
                _ = hb.tick() => {
                    let msg = serde_json::json!({ "MessageType": "KeepAlive" }).to_string();
                    if ws.send(Message::Text(msg)).await.is_err() {
                        break;
                    }
                }
                _ = rx.recv() => {
                    let _ = ws.send(Message::Close(None)).await;
                    break;
                }
            }
        }

        let _ = self.handle.emit(EVENT_DISCONNECTED, &server.id);
        Ok(())
    }
}
