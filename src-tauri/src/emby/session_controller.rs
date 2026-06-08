//! Translates inbound socket messages (Playstate / GeneralCommand / Play) into
//! local `MpvCommand`s so other clients can control this player remotely.
//!
//! See `docs/REMOTE_PERF_HOTKEYS_PLAN.md` for the design.

use std::time::{Duration, Instant};

use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufRead, AsyncBufReadExt};

use crate::config::models::{Account, Server};
use crate::config::ConfigStore;
use crate::emby::models::PlaybackProgress;
use crate::emby::socket::SocketEvent;
use crate::emby::EmbyClient;
use crate::error::{AppError, AppResult};
use crate::mpv::{parse_reporter_event, MpvCommand, MpvManager, MpvReporterEvent};
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
                http_seekable: None,
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

// ── External mpv progress bridge ────────────────────────────────────────────
//
// When Hills Lite launches an *external* mpv process (`play_external`), the
// frontend cannot poll an IPC snapshot to drive Emby session reporting. Instead
// mpv runs the bundled `hills_external_reporter.lua` script, which prints
// `HILLS_MPV_EVENT:` lines to stdout. We parse those here and translate them to
// Emby `Sessions/Playing/Progress` and `Sessions/Playing/Stopped` calls, with
// `time-pos` ticks throttled so a once-per-frame property observer cannot flood
// the server.

/// Emby reports time in 100ns ticks (10,000,000 per second).
const EMBY_TICKS_PER_SECOND: i64 = 10_000_000;

/// Minimum spacing between `time-pos`-driven progress reports.
const DEFAULT_EXTERNAL_PROGRESS_THROTTLE: Duration = Duration::from_secs(5);

fn seconds_to_ticks(seconds: f64) -> i64 {
    if !seconds.is_finite() || seconds <= 0.0 {
        return 0;
    }
    (seconds * EMBY_TICKS_PER_SECOND as f64) as i64
}

/// The reporting side-effect a single mpv event should produce.
#[derive(Debug, Clone, PartialEq)]
enum ExternalReportAction {
    None,
    Progress {
        position_ticks: i64,
        is_paused: bool,
    },
    Stopped {
        position_ticks: i64,
    },
}

/// Pure state machine that turns a stream of [`MpvReporterEvent`]s into throttled
/// Emby report actions. Kept free of any network/IO so it can be unit tested.
struct ExternalReportPlanner {
    throttle: Duration,
    last_progress_at: Option<Instant>,
    position_ticks: i64,
    paused: bool,
    stopped: bool,
}

impl ExternalReportPlanner {
    fn new(throttle: Duration) -> Self {
        Self {
            throttle,
            last_progress_at: None,
            position_ticks: 0,
            paused: false,
            stopped: false,
        }
    }

    fn progress(&mut self, now: Instant) -> ExternalReportAction {
        self.last_progress_at = Some(now);
        ExternalReportAction::Progress {
            position_ticks: self.position_ticks,
            is_paused: self.paused,
        }
    }

    fn on_event(&mut self, event: &MpvReporterEvent, now: Instant) -> ExternalReportAction {
        if self.stopped {
            return ExternalReportAction::None;
        }
        match event {
            // No position yet on start-file; wait for file-loaded.
            MpvReporterEvent::StartFile => ExternalReportAction::None,
            MpvReporterEvent::Speed { .. } => ExternalReportAction::None,
            // file-loaded / seek / pause are state changes that should reach the
            // server promptly (they register the session and fix the resume
            // point), so they bypass the throttle.
            MpvReporterEvent::FileLoaded { time_pos, .. } => {
                self.position_ticks = seconds_to_ticks(*time_pos);
                self.progress(now)
            }
            MpvReporterEvent::Seek { time_pos } => {
                self.position_ticks = seconds_to_ticks(*time_pos);
                self.progress(now)
            }
            MpvReporterEvent::Pause { paused, time_pos } => {
                if let Some(tp) = time_pos {
                    self.position_ticks = seconds_to_ticks(*tp);
                }
                self.paused = *paused;
                self.progress(now)
            }
            // The frequent ticker is throttled to avoid flooding the server.
            MpvReporterEvent::TimePos { time_pos } => {
                self.position_ticks = seconds_to_ticks(*time_pos);
                let due = match self.last_progress_at {
                    None => true,
                    Some(prev) => now.duration_since(prev) >= self.throttle,
                };
                if due {
                    self.progress(now)
                } else {
                    ExternalReportAction::None
                }
            }
            MpvReporterEvent::EndFile { time_pos, .. } => {
                self.position_ticks = seconds_to_ticks(*time_pos);
                self.stopped = true;
                ExternalReportAction::Stopped {
                    position_ticks: self.position_ticks,
                }
            }
        }
    }

    /// Called once the mpv stdout stream closes (process exit). Emits a final
    /// Stopped report unless an `end-file` already produced one, so an abnormal
    /// external-process exit still cleans up the Emby session.
    fn on_stream_end(&mut self) -> ExternalReportAction {
        if self.stopped {
            return ExternalReportAction::None;
        }
        self.stopped = true;
        ExternalReportAction::Stopped {
            position_ticks: self.position_ticks,
        }
    }
}

/// Bridges external-mpv reporter events to Emby session reporting for one
/// playback session.
pub struct ExternalPlaybackReporter {
    emby: EmbyClient,
    server: Server,
    account: Account,
    item_id: String,
    play_session_id: String,
    play_method: String,
    planner: ExternalReportPlanner,
}

impl ExternalPlaybackReporter {
    pub fn new(
        emby: EmbyClient,
        server: Server,
        account: Account,
        item_id: String,
        play_session_id: String,
        play_method: String,
    ) -> Self {
        Self {
            emby,
            server,
            account,
            item_id,
            play_session_id,
            play_method,
            planner: ExternalReportPlanner::new(DEFAULT_EXTERNAL_PROGRESS_THROTTLE),
        }
    }

    async fn apply(&self, action: ExternalReportAction) {
        match action {
            ExternalReportAction::None => {}
            ExternalReportAction::Progress {
                position_ticks,
                is_paused,
            } => {
                let progress = PlaybackProgress {
                    item_id: self.item_id.clone(),
                    play_session_id: self.play_session_id.clone(),
                    position_ticks,
                    is_paused,
                    play_method: self.play_method.clone(),
                    volume_level: 100,
                };
                if let Err(e) = self
                    .emby
                    .report_progress(&self.server, &self.account, &progress)
                    .await
                {
                    tracing::debug!(target = "external-reporter", error = %e, "report_progress failed");
                }
            }
            ExternalReportAction::Stopped { position_ticks } => {
                if let Err(e) = self
                    .emby
                    .report_stopped(
                        &self.server,
                        &self.account,
                        &self.item_id,
                        &self.play_session_id,
                        position_ticks,
                    )
                    .await
                {
                    tracing::debug!(target = "external-reporter", error = %e, "report_stopped failed");
                }
            }
        }
    }

    async fn handle_event(&mut self, event: MpvReporterEvent) {
        let action = self.planner.on_event(&event, Instant::now());
        self.apply(action).await;
    }

    async fn finish(&mut self) {
        let action = self.planner.on_stream_end();
        self.apply(action).await;
    }
}

/// Read `HILLS_MPV_EVENT:` lines from an external mpv's stdout and forward them
/// to Emby session reporting until the stream closes. Designed to be spawned as
/// a detached task; it never panics on malformed input or a broken pipe so a
/// crashing external mpv can't take the app down.
pub async fn run_external_reporter<R>(reader: R, mut reporter: ExternalPlaybackReporter)
where
    R: AsyncBufRead + Unpin,
{
    let mut lines = reader.lines();
    loop {
        match lines.next_line().await {
            Ok(Some(line)) => {
                if let Some(event) = parse_reporter_event(&line) {
                    reporter.handle_event(event).await;
                }
            }
            Ok(None) => break,
            Err(e) => {
                tracing::debug!(target = "external-reporter", error = %e, "read external mpv stdout failed");
                break;
            }
        }
    }
    reporter.finish().await;
}

#[cfg(test)]
mod external_reporter_tests {
    use super::*;

    fn planner() -> ExternalReportPlanner {
        ExternalReportPlanner::new(Duration::from_secs(5))
    }

    #[test]
    fn file_loaded_reports_immediately() {
        let mut p = planner();
        let now = Instant::now();
        assert_eq!(
            p.on_event(
                &MpvReporterEvent::FileLoaded {
                    time_pos: 10.0,
                    media_title: None,
                    path: None,
                },
                now,
            ),
            ExternalReportAction::Progress {
                position_ticks: 10 * EMBY_TICKS_PER_SECOND,
                is_paused: false,
            }
        );
    }

    #[test]
    fn time_pos_is_throttled_between_reports() {
        let mut p = planner();
        let t0 = Instant::now();
        // First tick always reports.
        assert!(matches!(
            p.on_event(&MpvReporterEvent::TimePos { time_pos: 1.0 }, t0),
            ExternalReportAction::Progress { .. }
        ));
        // A tick shortly after is suppressed.
        assert_eq!(
            p.on_event(
                &MpvReporterEvent::TimePos { time_pos: 2.0 },
                t0 + Duration::from_secs(1),
            ),
            ExternalReportAction::None
        );
        // After the throttle window it reports again, with the latest position.
        assert_eq!(
            p.on_event(
                &MpvReporterEvent::TimePos { time_pos: 7.0 },
                t0 + Duration::from_secs(6),
            ),
            ExternalReportAction::Progress {
                position_ticks: 7 * EMBY_TICKS_PER_SECOND,
                is_paused: false,
            }
        );
    }

    #[test]
    fn pause_reports_immediately_and_tracks_state() {
        let mut p = planner();
        let t0 = Instant::now();
        let _ = p.on_event(&MpvReporterEvent::TimePos { time_pos: 3.0 }, t0);
        // Pause bypasses the throttle even right after a tick.
        assert_eq!(
            p.on_event(
                &MpvReporterEvent::Pause {
                    paused: true,
                    time_pos: Some(3.0),
                },
                t0 + Duration::from_millis(200),
            ),
            ExternalReportAction::Progress {
                position_ticks: 3 * EMBY_TICKS_PER_SECOND,
                is_paused: true,
            }
        );
    }

    #[test]
    fn seek_reports_new_position_immediately() {
        let mut p = planner();
        let t0 = Instant::now();
        let _ = p.on_event(&MpvReporterEvent::TimePos { time_pos: 1.0 }, t0);
        assert_eq!(
            p.on_event(
                &MpvReporterEvent::Seek { time_pos: 120.0 },
                t0 + Duration::from_millis(10),
            ),
            ExternalReportAction::Progress {
                position_ticks: 120 * EMBY_TICKS_PER_SECOND,
                is_paused: false,
            }
        );
    }

    #[test]
    fn end_file_stops_and_silences_further_events() {
        let mut p = planner();
        let t0 = Instant::now();
        assert_eq!(
            p.on_event(
                &MpvReporterEvent::EndFile {
                    time_pos: 42.0,
                    reason: Some("eof".into()),
                },
                t0,
            ),
            ExternalReportAction::Stopped {
                position_ticks: 42 * EMBY_TICKS_PER_SECOND,
            }
        );
        // Late events after end-file are ignored.
        assert_eq!(
            p.on_event(
                &MpvReporterEvent::TimePos { time_pos: 99.0 },
                t0 + Duration::from_secs(30),
            ),
            ExternalReportAction::None
        );
        // And the stream-end fallback does not double-report.
        assert_eq!(p.on_stream_end(), ExternalReportAction::None);
    }

    #[test]
    fn stream_end_reports_stop_when_no_end_file_seen() {
        let mut p = planner();
        let t0 = Instant::now();
        let _ = p.on_event(
            &MpvReporterEvent::FileLoaded {
                time_pos: 5.0,
                media_title: None,
                path: None,
            },
            t0,
        );
        let _ = p.on_event(
            &MpvReporterEvent::TimePos { time_pos: 50.0 },
            t0 + Duration::from_secs(6),
        );
        // Abnormal exit (no end-file) still cleans up the session at last pos.
        assert_eq!(
            p.on_stream_end(),
            ExternalReportAction::Stopped {
                position_ticks: 50 * EMBY_TICKS_PER_SECOND,
            }
        );
    }
}
