//! Standalone (independent-window) mpv playback mode.
//!
//! HillsLite (the Flutter reference app) launches a separate native player
//! process for actual playback and tracks progress by parsing an mpv Lua
//! reporter on stdout. This module is the Tauri/Rust equivalent: it launches
//! the **bundled** `mpv.exe` as its own top-level window (no `--wid`
//! embedding), so playback controls are carried by mpv's native OSC instead of
//! a WebView overlay. That sidesteps the `WS_CHILD` / WebView2 z-order issues
//! the embedded path fights with.
//!
//! Playback progress is reported back to Emby/Jellyfin entirely from the Rust
//! side: mpv loads `hills_external_reporter.lua` (see
//! `resources/mpv/hills_external_reporter.lua`) via `--script`, which writes
//! `HILLS_MPV_EVENT:` JSON lines to stdout. We decode them with the shared
//! [`parse_reporter_event`] helper and map them onto
//! `report_progress` / `report_stopped`.
//!
//! Constraints (Hills Lite local-decode policy): this mode only ever launches
//! the bundled mpv (never system/PATH/PotPlayer) and only plays the Direct
//! Play / Direct Stream proxy URL produced by the normal playback path, so no
//! server-side transcoding is ever involved.

use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::ChildStdout;
use tokio::process::{Child, Command};
use tokio::sync::Mutex as AsyncMutex;
use tokio::time::timeout;

use crate::config::models::{Account, Server};
use crate::emby::models::PlaybackProgress;
use crate::emby::EmbyClient;
use crate::error::{AppError, AppResult};
use crate::mpv::backend::{parse_reporter_event, MpvReporterEvent};
use crate::mpv::paths::{resolve_mpv_exe, resolve_reporter_script};

/// How often (at most) periodic `time-pos` ticks are forwarded to the server.
const PROGRESS_THROTTLE: Duration = Duration::from_secs(3);

/// Everything required to launch one standalone playback session.
pub struct StandaloneStartRequest {
    /// Local stream-proxy URL (auth headers are already baked into the proxy,
    /// so mpv opens it with no extra headers).
    pub url: String,
    pub title: String,
    pub start_ms: Option<i64>,
    pub server: Server,
    pub account: Account,
    pub item_id: String,
    pub play_session_id: String,
    /// `DirectPlay` or `DirectStream` (sanitized before reporting).
    pub play_method: String,
    pub volume: i32,
    pub hardware_decoding: bool,
    pub cache_mb: u32,
}

/// Identity + reporting sink shared with the stdout reader task.
struct ReportState {
    emby: EmbyClient,
    server: Server,
    account: Account,
    item_id: String,
    play_session_id: String,
    play_method: String,
    volume: i32,
    last_position_ms: AtomicI64,
    stopped: AtomicBool,
}

impl ReportState {
    async fn report_progress(&self, position_ms: i64, paused: bool) {
        let progress = PlaybackProgress {
            item_id: self.item_id.clone(),
            play_session_id: self.play_session_id.clone(),
            position_ticks: position_ms.max(0) * 10_000,
            is_paused: paused,
            play_method: sanitize_play_method(&self.play_method).to_string(),
            volume_level: self.volume,
        };
        if let Err(error) = self
            .emby
            .report_progress(&self.server, &self.account, &progress)
            .await
        {
            tracing::warn!(target = "mpv-standalone", error = %error, "report_progress failed");
        }
    }

    /// Report `Stopped` at most once per session (end-file and the stdout EOF
    /// fallback both call this; only the first wins).
    async fn report_stopped(&self, position_ms: i64) {
        if self.stopped.swap(true, Ordering::SeqCst) {
            return;
        }
        if let Err(error) = self
            .emby
            .report_stopped(
                &self.server,
                &self.account,
                &self.item_id,
                &self.play_session_id,
                position_ms.max(0) * 10_000,
            )
            .await
        {
            tracing::warn!(target = "mpv-standalone", error = %error, "report_stopped failed");
        }
    }
}

struct Session {
    child: Child,
    reader: tokio::task::JoinHandle<()>,
    state: Arc<ReportState>,
}

/// Launches and supervises the bundled mpv in its own window, mapping reporter
/// events onto Emby session reporting. Cloneable; a single live session is kept
/// at a time.
#[derive(Clone)]
pub struct StandalonePlayer {
    emby: EmbyClient,
    inner: Arc<AsyncMutex<Option<Session>>>,
}

impl StandalonePlayer {
    pub fn new(emby: EmbyClient) -> Self {
        Self {
            emby,
            inner: Arc::new(AsyncMutex::new(None)),
        }
    }

    /// Whether a standalone mpv process is currently alive.
    pub async fn is_active(&self) -> bool {
        let mut guard = self.inner.lock().await;
        let Some(session) = guard.as_mut() else {
            return false;
        };
        match session.child.try_wait() {
            Ok(None) => true,
            _ => {
                // Process already exited: clean up so the next start is fresh.
                if let Some(session) = guard.take() {
                    session.reader.abort();
                }
                false
            }
        }
    }

    /// Start a new standalone playback session. Any previous session is stopped
    /// (and its `Stopped` reported) first.
    pub async fn start(&self, req: StandaloneStartRequest) -> AppResult<()> {
        self.stop().await?;

        let exe = resolve_mpv_exe();
        let args = build_args(&req, &exe);

        let mut command = Command::new(&exe);
        command
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);

        let mut child = command
            .spawn()
            .map_err(|e| AppError::Mpv(format!("spawn standalone mpv ({}): {e}", exe.display())))?;

        let stdout: ChildStdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::Mpv("standalone mpv stdout unavailable".into()))?;

        let state = Arc::new(ReportState {
            emby: self.emby.clone(),
            server: req.server,
            account: req.account,
            item_id: req.item_id,
            play_session_id: req.play_session_id,
            play_method: req.play_method,
            volume: req.volume,
            last_position_ms: AtomicI64::new(req.start_ms.unwrap_or(0).max(0)),
            stopped: AtomicBool::new(false),
        });

        let reader = tokio::spawn(run_reader(stdout, state.clone()));
        *self.inner.lock().await = Some(Session {
            child,
            reader,
            state,
        });
        Ok(())
    }

    /// Stop the current standalone session: kill the process, report `Stopped`
    /// at the last observed position, and tear down the reader task.
    pub async fn stop(&self) -> AppResult<()> {
        let Some(mut session) = self.inner.lock().await.take() else {
            return Ok(());
        };
        let _ = session.child.start_kill();
        let _ = timeout(Duration::from_secs(2), session.child.wait()).await;
        let position = session.state.last_position_ms.load(Ordering::SeqCst);
        session.state.report_stopped(position).await;
        session.reader.abort();
        Ok(())
    }
}

fn build_args(req: &StandaloneStartRequest, exe: &std::path::Path) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "--no-config".into(),
        "--force-window=yes".into(),
        "--keep-open=no".into(),
        "--no-terminal".into(),
        "--msg-level=all=warn".into(),
        "--osc=yes".into(),
        // Keep the machine awake during playback (mpv default, set explicitly).
        "--stop-screensaver=yes".into(),
        format!("--title={}", req.title),
        format!("--volume={}", req.volume.clamp(0, 200)),
    ];

    if let Some(script) = resolve_reporter_script() {
        args.push(format!("--script={}", script.display()));
    }

    // Quick win: prefer the bundled subtitle font directory for libass when a
    // `subfont.ttf` ships next to mpv (CH-6 owns shipping the font itself).
    if let Some(dir) = exe.parent() {
        let subfont = dir.join("subfont.ttf");
        if subfont.is_file() {
            args.push(format!("--sub-fonts-dir={}", dir.display()));
        }
    }

    if req.hardware_decoding {
        args.push("--hwdec=auto-safe".into());
    }
    if req.cache_mb > 0 {
        args.push("--cache=yes".into());
        args.push(format!("--demuxer-max-bytes={}MiB", req.cache_mb));
    }
    if let Some(ms) = req.start_ms.filter(|ms| *ms > 0) {
        args.push(format!("--start={:.3}", ms as f64 / 1000.0));
    }

    args.push(req.url.clone());
    args
}

async fn run_reader(stdout: ChildStdout, state: Arc<ReportState>) {
    let mut lines = BufReader::new(stdout).lines();
    let mut last_report = Instant::now()
        .checked_sub(PROGRESS_THROTTLE * 2)
        .unwrap_or_else(Instant::now);
    let mut paused = false;

    while let Ok(Some(line)) = lines.next_line().await {
        let Some(event) = parse_reporter_event(&line) else {
            continue;
        };
        match event {
            MpvReporterEvent::FileLoaded { time_pos, .. } => {
                let ms = secs_to_ms(time_pos);
                state.last_position_ms.store(ms, Ordering::SeqCst);
                paused = false;
                // First progress doubles as PlaybackStart (Emby registers the
                // now-playing session on the first progress POST).
                state.report_progress(ms, false).await;
                last_report = Instant::now();
            }
            MpvReporterEvent::TimePos { time_pos } => {
                let ms = secs_to_ms(time_pos);
                state.last_position_ms.store(ms, Ordering::SeqCst);
                if last_report.elapsed() >= PROGRESS_THROTTLE {
                    state.report_progress(ms, paused).await;
                    last_report = Instant::now();
                }
            }
            MpvReporterEvent::Pause {
                paused: p,
                time_pos,
            } => {
                paused = p;
                if let Some(tp) = time_pos {
                    state
                        .last_position_ms
                        .store(secs_to_ms(tp), Ordering::SeqCst);
                }
                let ms = state.last_position_ms.load(Ordering::SeqCst);
                state.report_progress(ms, paused).await;
                last_report = Instant::now();
            }
            MpvReporterEvent::Seek { time_pos } => {
                let ms = secs_to_ms(time_pos);
                state.last_position_ms.store(ms, Ordering::SeqCst);
                state.report_progress(ms, paused).await;
                last_report = Instant::now();
            }
            MpvReporterEvent::EndFile { time_pos, .. } => {
                if time_pos > 0.0 {
                    state
                        .last_position_ms
                        .store(secs_to_ms(time_pos), Ordering::SeqCst);
                }
                let ms = state.last_position_ms.load(Ordering::SeqCst);
                state.report_stopped(ms).await;
            }
            MpvReporterEvent::StartFile | MpvReporterEvent::Speed { .. } => {}
        }
    }

    // stdout closed (mpv exited / was killed): make sure Stopped is reported.
    let ms = state.last_position_ms.load(Ordering::SeqCst);
    state.report_stopped(ms).await;
}

fn secs_to_ms(seconds: f64) -> i64 {
    if !seconds.is_finite() || seconds <= 0.0 {
        return 0;
    }
    (seconds * 1000.0) as i64
}

/// Mirror `commands::media::sanitize_play_method`: never report a transcode
/// method (Hills Lite stays local-decode only).
fn sanitize_play_method(value: &str) -> &'static str {
    if value == "DirectStream" {
        "DirectStream"
    } else {
        "DirectPlay"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secs_to_ms_clamps_and_converts() {
        assert_eq!(secs_to_ms(12.5), 12_500);
        assert_eq!(secs_to_ms(0.0), 0);
        assert_eq!(secs_to_ms(-3.0), 0);
        assert_eq!(secs_to_ms(f64::NAN), 0);
    }

    #[test]
    fn sanitize_play_method_blocks_transcode() {
        assert_eq!(sanitize_play_method("DirectStream"), "DirectStream");
        assert_eq!(sanitize_play_method("DirectPlay"), "DirectPlay");
        assert_eq!(sanitize_play_method("Transcode"), "DirectPlay");
    }
}
