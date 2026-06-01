//! Translates inbound socket messages (Playstate / GeneralCommand / Play) into
//! local `MpvCommand`s so other clients can control this player remotely.
//!
//! See `docs/REMOTE_PERF_HOTKEYS_PLAN.md` for the design.

use serde_json::Value;
use tauri::{AppHandle, Emitter};

use crate::config::models::{Account, Server};
use crate::config::ConfigStore;
use crate::emby::socket::SocketEvent;
use crate::emby::EmbyClient;
use crate::error::{AppError, AppResult};
use crate::mpv::{MpvCommand, MpvManager};
use crate::notifications::{
    NotificationCategory, NotificationCenter, NotificationKind, NotificationSpec,
};

pub struct SessionController {
    pub config: ConfigStore,
    pub emby: EmbyClient,
    pub mpv: MpvManager,
    pub notifications: NotificationCenter,
    pub handle: AppHandle,
}

impl SessionController {
    pub fn new(
        config: ConfigStore,
        emby: EmbyClient,
        mpv: MpvManager,
        notifications: NotificationCenter,
        handle: AppHandle,
    ) -> Self {
        Self {
            config,
            emby,
            mpv,
            notifications,
            handle,
        }
    }

    pub async fn handle(&self, server: &Server, account: &Account, ev: SocketEvent) {
        if let Err(e) = self.dispatch(server, account, ev).await {
            tracing::warn!(target = "session-controller", error = %e, "dispatch failed");
        }
    }

    async fn dispatch(&self, server: &Server, account: &Account, ev: SocketEvent) -> AppResult<()> {
        match ev.message_type.as_str() {
            "Playstate" => self.dispatch_playstate(ev.payload).await,
            "GeneralCommand" => self.dispatch_general(ev.payload).await,
            "Play" => self.dispatch_play(server, account, ev.payload).await,
            _ => Ok(()),
        }
    }

    async fn dispatch_playstate(&self, payload: Value) -> AppResult<()> {
        let cmd = payload.get("Command").and_then(Value::as_str).unwrap_or("");
        let backend = self.mpv.backend();
        match cmd {
            "PlayPause" => {
                let snap = backend.snapshot().await?;
                if snap.paused {
                    backend.execute(MpvCommand::Resume).await?;
                } else {
                    backend.execute(MpvCommand::Pause).await?;
                }
            }
            "Pause" => backend.execute(MpvCommand::Pause).await?,
            "Unpause" => backend.execute(MpvCommand::Resume).await?,
            "Stop" => backend.execute(MpvCommand::Stop).await?,
            "NextTrack" => {
                let _ = self.handle.emit("player:next_track", ());
            }
            "PreviousTrack" => {
                let _ = self.handle.emit("player:prev_track", ());
            }
            "Seek" => {
                if let Some(ticks) = payload.get("SeekPositionTicks").and_then(Value::as_i64) {
                    let ms = ticks / 10_000;
                    backend
                        .execute(MpvCommand::Seek { position_ms: ms })
                        .await?;
                }
            }
            "Rewind" => {
                let snap = backend.snapshot().await?;
                backend
                    .execute(MpvCommand::Seek {
                        position_ms: (snap.position_ms - 15_000).max(0),
                    })
                    .await?;
            }
            "FastForward" => {
                let snap = backend.snapshot().await?;
                backend
                    .execute(MpvCommand::Seek {
                        position_ms: snap.position_ms + 30_000,
                    })
                    .await?;
            }
            _ => {}
        }
        Ok(())
    }

    async fn dispatch_general(&self, payload: Value) -> AppResult<()> {
        let name = payload.get("Name").and_then(Value::as_str).unwrap_or("");
        let args = payload.get("Arguments").cloned().unwrap_or(Value::Null);
        let backend = self.mpv.backend();
        match name {
            "ToggleMute" => {
                let snap = backend.snapshot().await?;
                backend.execute(MpvCommand::SetMuted(!snap.muted)).await?;
            }
            "SetVolume" => {
                if let Some(v) = arg_i64(&args, "Volume").or_else(|| arg_i64(&args, "value")) {
                    backend
                        .execute(MpvCommand::SetVolume(v.clamp(0, 200) as i32))
                        .await?;
                }
            }
            "VolumeUp" | "VolumeDown" => {
                let snap = backend.snapshot().await?;
                let delta = if name == "VolumeUp" { 5 } else { -5 };
                backend
                    .execute(MpvCommand::SetVolume((snap.volume + delta).clamp(0, 200)))
                    .await?;
            }
            "SetAudioStreamIndex" => {
                if let Some(idx) = arg_i64(&args, "Index") {
                    backend
                        .execute(MpvCommand::SetAudioTrack {
                            id: idx,
                            preserve_cache: self.config.settings().preserve_track_switch_cache,
                        })
                        .await?;
                }
            }
            "SetSubtitleStreamIndex" => {
                let idx = arg_i64(&args, "Index");
                backend
                    .execute(MpvCommand::SetSubtitleTrack {
                        id: idx.filter(|v| *v >= 0),
                        preserve_cache: self.config.settings().preserve_track_switch_cache,
                    })
                    .await?;
            }
            "DisplayMessage" => {
                let header = args
                    .get("Header")
                    .and_then(Value::as_str)
                    .unwrap_or("远程消息")
                    .to_string();
                let text = args
                    .get("Text")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let _ = self.notifications.push(
                    NotificationSpec::new(
                        NotificationKind::Info,
                        NotificationCategory::System,
                        header,
                    )
                    .body(text),
                );
            }
            _ => {}
        }
        Ok(())
    }

    async fn dispatch_play(
        &self,
        server: &Server,
        account: &Account,
        payload: Value,
    ) -> AppResult<()> {
        let item_ids: Vec<String> = payload
            .get("ItemIds")
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default();
        let Some(item_id) = item_ids.first().cloned() else {
            return Ok(());
        };
        let start_ticks = payload
            .get("StartPositionTicks")
            .and_then(Value::as_i64)
            .unwrap_or(0);

        let item = self.emby.get_item(server, account, &item_id).await?;
        let pb = self
            .emby
            .playback_info(server, account, &item_id, Some(start_ticks))
            .await?;
        let source = pb
            .media_sources
            .iter()
            .find(|source| source.supports_local_decode())
            .ok_or_else(|| {
                AppError::InvalidState(
                    "已阻止远程播放：服务端没有返回可本机直连或本机直流的媒体源。Hills Lite 不允许服务端解码/转码，以避免压垮 NAS、路由器或 VPS。".into(),
                )
            })?
            .clone();
        let url = self.emby.build_stream_url(
            server,
            account,
            &item,
            &source,
            &pb.play_session_id,
            true,
        )?;

        let line = server
            .lines
            .iter()
            .find(|l| Some(&l.id) == server.active_line_id.as_ref())
            .or_else(|| server.lines.first())
            .ok_or_else(|| AppError::NoLine(server.id.clone()))?;
        let ua = line
            .user_agent
            .clone()
            .or_else(|| server.default_user_agent.clone());
        let mut headers = line.headers.clone();
        headers.push(("X-Emby-Token".into(), account.access_token.clone()));
        headers.push((
            "Authorization".into(),
            format!("MediaBrowser Token=\"{}\"", account.access_token),
        ));

        self.mpv
            .backend()
            .execute(MpvCommand::Load {
                url: url.to_string(),
                headers,
                user_agent: ua,
                start_ms: Some(start_ticks / 10_000),
                stream_record_path: None,
                autoload_subtitles: true,
            })
            .await?;

        let _ = self.notifications.push(
            NotificationSpec::new(
                NotificationKind::Info,
                NotificationCategory::System,
                format!("远程开始播放: {}", item.name),
            )
            .source(item.id.clone()),
        );

        Ok(())
    }
}

fn arg_i64(v: &Value, key: &str) -> Option<i64> {
    v.get(key).and_then(|x| match x {
        Value::Number(n) => n.as_i64(),
        Value::String(s) => s.parse::<i64>().ok(),
        _ => None,
    })
}
