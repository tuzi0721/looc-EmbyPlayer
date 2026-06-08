//! Standalone (independent-window) player host integration.
//!
//! HillsLite (the closed-source reference app, reverse-engineered by the team)
//! runs actual playback in a *separate native player process* (`HillsPlayer.exe`,
//! Qt6/QML + libmpv) that the Flutter shell controls with mpv-style argv plus a
//! line-based stdout JSON reporter, sidestepping the whole class of "native
//! window over an opaque WebView" bugs. The team's architecture re-evaluation
//! adopted the same model.
//!
//! This module is the **Rust/Tauri host integration** for that model (task T9c):
//!
//! - It spawns a player binary in its own top-level window. The spawn target is
//!   resolvable: it prefers our self-developed `resources/player/player.exe`
//!   (tasks T9a/T9b) and falls back to the bundled `mpv.exe` so the path works
//!   today and upgrades seamlessly once the custom player ships.
//! - It passes mpv-compatible argv (URL, `--start`, `--aid`, `--sid`,
//!   `--sub-file`, `--script`, `--force-window`, `--fullscreen`, ...).
//! - It reads the player's stdout, decodes `HILLS_MPV_EVENT:` lines with the
//!   shared [`parse_reporter_event`] and maps them onto Emby
//!   `report_progress` / `report_stopped` (resume + mark-watched, throttled,
//!   with an EOF fallback).
//! - It opens an mpv-compatible **control IPC** (`--input-ipc-server`) so the
//!   host / Emby remote control can drive play/pause/seek/volume/stop. The
//!   custom player is expected to honor the same JSON IPC contract.
//!
//! Hills Lite local-decode policy: only a bundled binary is ever launched
//! (never system/PATH/PotPlayer) and only the Direct Play / Direct Stream proxy
//! URL is played, so no server-side transcoding is ever involved.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdout, Command};
use tokio::sync::{mpsc, Mutex as AsyncMutex};
use tokio::time::timeout;
use uuid::Uuid;

use crate::config::models::{Account, Server};
use crate::emby::models::PlaybackProgress;
use crate::emby::EmbyClient;
use crate::error::{AppError, AppResult};
use crate::mpv::backend::{parse_reporter_event, MpvReporterEvent};
use crate::mpv::paths::{resolve_mpv_exe, resolve_reporter_script};

/// How often (at most) periodic `time-pos` ticks are forwarded to the server.
const PROGRESS_THROTTLE: Duration = Duration::from_secs(3);

/// A host-issued control command for the standalone player, sent over the
/// mpv-compatible IPC channel.
#[derive(Debug, Clone)]
pub enum StandaloneControl {
    Pause,
    Resume,
    Stop,
    Seek { position_ms: i64 },
    SetVolume { volume: i32 },
    SetAudioTrack { id: i64 },
    SetSubtitleTrack { id: Option<i64> },
}

impl StandaloneControl {
    fn to_ipc_command(&self) -> Value {
        match self {
            Self::Pause => json!({ "command": ["set_property", "pause", true] }),
            Self::Resume => json!({ "command": ["set_property", "pause", false] }),
            Self::Stop => json!({ "command": ["quit"] }),
            Self::Seek { position_ms } => {
                json!({ "command": ["seek", (*position_ms).max(0) as f64 / 1000.0, "absolute"] })
            }
            Self::SetVolume { volume } => {
                json!({ "command": ["set_property", "volume", (*volume).clamp(0, 200)] })
            }
            Self::SetAudioTrack { id } => json!({ "command": ["set_property", "aid", id] }),
            Self::SetSubtitleTrack { id } => match id {
                Some(id) => json!({ "command": ["set_property", "sid", id] }),
                None => json!({ "command": ["set_property", "sid", "no"] }),
            },
        }
    }
}

/// Everything required to launch one standalone playback session.
pub struct StandaloneStartRequest {
    /// Local stream-proxy URL (auth headers are already baked into the proxy,
    /// so the player opens it with no extra headers).
    pub url: String,
    pub title: String,
    pub start_ms: Option<i64>,
    pub audio_track: Option<i64>,
    pub subtitle_track: Option<i64>,
    pub sub_file: Option<String>,
    pub fullscreen: bool,
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
    /// mpv-compatible control channel (`--input-ipc-server`). `None` when the
    /// IPC pipe could not be connected (control degrades to the native OSC).
    ipc_tx: Option<mpsc::Sender<Value>>,
}

/// Launches and supervises the standalone player in its own window, mapping
/// reporter events onto Emby session reporting and exposing a control channel.
/// Cloneable; a single live session is kept at a time.
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

    /// Whether a standalone player process is currently alive.
    pub async fn is_active(&self) -> bool {
        let mut guard = self.inner.lock().await;
        let Some(session) = guard.as_mut() else {
            return false;
        };
        match session.child.try_wait() {
            Ok(None) => true,
            _ => {
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

        let exe = resolve_player_exe();
        let ipc_path = new_ipc_path();
        let args = build_args(&req, &exe, &ipc_path);

        let mut command = Command::new(&exe);
        command
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);

        let mut child = command.spawn().map_err(|e| {
            AppError::Mpv(format!("spawn standalone player ({}): {e}", exe.display()))
        })?;

        let stdout: ChildStdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::Mpv("standalone player stdout unavailable".into()))?;

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
        // Best-effort: connect the control IPC channel (the player creates the
        // pipe asynchronously, so this retries briefly). Control degrades to the
        // player's native OSC if it never connects.
        let ipc_tx = connect_ipc_writer(ipc_path).await;

        *self.inner.lock().await = Some(Session {
            child,
            reader,
            state,
            ipc_tx,
        });
        Ok(())
    }

    /// Send a control command to the running player over its IPC channel.
    pub async fn control(&self, command: StandaloneControl) -> AppResult<()> {
        let tx = {
            let guard = self.inner.lock().await;
            guard.as_ref().and_then(|session| session.ipc_tx.clone())
        };
        let Some(tx) = tx else {
            return Err(AppError::InvalidState(
                "standalone player has no control channel (not running, or IPC unavailable)".into(),
            ));
        };
        tx.send(command.to_ipc_command())
            .await
            .map_err(|_| AppError::InvalidState("standalone control channel closed".into()))?;
        Ok(())
    }

    /// Stop the current standalone session: ask it to quit over IPC, kill the
    /// process, report `Stopped` at the last observed position, and tear down
    /// the reader task.
    pub async fn stop(&self) -> AppResult<()> {
        let Some(mut session) = self.inner.lock().await.take() else {
            return Ok(());
        };
        if let Some(tx) = &session.ipc_tx {
            let _ = tx.send(json!({ "command": ["quit"] })).await;
        }
        // Give a graceful quit a brief moment before force killing.
        if timeout(Duration::from_millis(600), session.child.wait())
            .await
            .is_err()
        {
            let _ = session.child.start_kill();
            let _ = timeout(Duration::from_secs(2), session.child.wait()).await;
        }
        let position = session.state.last_position_ms.load(Ordering::SeqCst);
        session.state.report_stopped(position).await;
        session.reader.abort();
        Ok(())
    }
}

/// Resolve the standalone player executable.
///
/// Prefers the self-developed player (`resources/player/player.exe`, tasks
/// T9a/T9b) so the host upgrades automatically once it ships; falls back to the
/// bundled `mpv.exe` otherwise. Only ever a bundled binary — never
/// system/PATH/PotPlayer.
fn resolve_player_exe() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for rel in [
                "resources/player/player.exe",
                "resources/player/hills_player.exe",
                "resources/player/HillsPlayer.exe",
                "player/player.exe",
                "player/hills_player.exe",
            ] {
                let candidate = dir.join(rel);
                if candidate.is_file() {
                    return candidate;
                }
            }
        }
    }
    for dev_rel in [
        "resources/player/player.exe",
        "resources/player/hills_player.exe",
        "player/build/hills_player.exe",
    ] {
        let dev = PathBuf::from(dev_rel);
        if dev.is_file() {
            return dev;
        }
    }
    // Fallback: the bundled mpv runs the same reporter/IPC contract.
    resolve_mpv_exe()
}

fn new_ipc_path() -> String {
    let unique = Uuid::new_v4().simple();
    #[cfg(windows)]
    {
        format!(r"\\.\pipe\hills-standalone-{unique}")
    }
    #[cfg(not(windows))]
    {
        std::env::temp_dir()
            .join(format!("hills-standalone-{unique}.sock"))
            .to_string_lossy()
            .to_string()
    }
}

fn build_args(req: &StandaloneStartRequest, exe: &Path, ipc_path: &str) -> Vec<String> {
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
        format!("--input-ipc-server={ipc_path}"),
    ];

    if req.fullscreen {
        args.push("--fullscreen=yes".into());
    }

    if let Some(script) = resolve_reporter_script() {
        args.push(format!("--script={}", script.display()));
    }

    // Quick win: prefer the bundled subtitle font directory for libass when a
    // `subfont.ttf` ships next to the player (font shipping is CH-6 / T4).
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
    if let Some(aid) = req.audio_track {
        args.push(format!("--aid={aid}"));
    }
    if let Some(sid) = req.subtitle_track {
        args.push(format!("--sid={sid}"));
    }
    if let Some(sub_file) = req
        .sub_file
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        args.push(format!("--sub-file={sub_file}"));
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
            MpvReporterEvent::Pause { paused: p, time_pos } => {
                paused = p;
                if let Some(tp) = time_pos {
                    state.last_position_ms.store(secs_to_ms(tp), Ordering::SeqCst);
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

    // stdout closed (player exited / was killed): make sure Stopped is reported.
    let ms = state.last_position_ms.load(Ordering::SeqCst);
    state.report_stopped(ms).await;
}

/// Connect to the player's mpv-compatible IPC pipe and return a sender for
/// newline-delimited JSON commands. Returns `None` if the pipe never appears.
async fn connect_ipc_writer(ipc_path: String) -> Option<mpsc::Sender<Value>> {
    let conn = connect_ipc(&ipc_path).await?;
    Some(spawn_ipc_io(conn))
}

fn spawn_ipc_io<S>(conn: S) -> mpsc::Sender<Value>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Send + 'static,
{
    let (read, mut write) = tokio::io::split(conn);
    let (tx, mut rx) = mpsc::channel::<Value>(32);
    // Drain inbound IPC (command acks / events) so the pipe never backs up.
    tokio::spawn(async move {
        let mut lines = BufReader::new(read).lines();
        while let Ok(Some(_)) = lines.next_line().await {}
    });
    tokio::spawn(async move {
        while let Some(command) = rx.recv().await {
            let line = format!("{command}\n");
            if write.write_all(line.as_bytes()).await.is_err() {
                break;
            }
            let _ = write.flush().await;
        }
    });
    tx
}

#[cfg(windows)]
async fn connect_ipc(
    pipe_path: &str,
) -> Option<tokio::net::windows::named_pipe::NamedPipeClient> {
    use tokio::net::windows::named_pipe::ClientOptions;
    let deadline = tokio::time::Instant::now() + Duration::from_secs(8);
    loop {
        match ClientOptions::new().open(pipe_path) {
            Ok(client) => return Some(client),
            Err(_) => {
                if tokio::time::Instant::now() >= deadline {
                    return None;
                }
                tokio::time::sleep(Duration::from_millis(60)).await;
            }
        }
    }
}

#[cfg(not(windows))]
async fn connect_ipc(socket_path: &str) -> Option<tokio::net::UnixStream> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(8);
    loop {
        match tokio::net::UnixStream::connect(socket_path).await {
            Ok(conn) => return Some(conn),
            Err(_) => {
                if tokio::time::Instant::now() >= deadline {
                    return None;
                }
                tokio::time::sleep(Duration::from_millis(60)).await;
            }
        }
    }
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

    #[test]
    fn control_maps_to_mpv_ipc() {
        assert_eq!(
            StandaloneControl::Pause.to_ipc_command(),
            json!({ "command": ["set_property", "pause", true] })
        );
        assert_eq!(
            StandaloneControl::Seek { position_ms: 90_000 }.to_ipc_command(),
            json!({ "command": ["seek", 90.0, "absolute"] })
        );
        assert_eq!(
            StandaloneControl::SetSubtitleTrack { id: None }.to_ipc_command(),
            json!({ "command": ["set_property", "sid", "no"] })
        );
    }
}
