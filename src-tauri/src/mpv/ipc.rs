use std::collections::HashMap;
use std::process::{Command as StdCommand, Stdio};
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use parking_lot::Mutex;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot, Mutex as AsyncMutex};
use tokio::time::timeout;

use crate::config::models::{Anime4kMode, AppSettings};
use crate::error::{AppError, AppResult};
use crate::mpv::anime4k::{glsl_change_list_value, resolve_mode_shader_paths};
use crate::mpv::backend::{
    MpvBackend, MpvChapterInfo, MpvCommand, MpvSnapshot, MpvTrackInfo, PictureMode, TrackKind,
};
use crate::mpv::paths::{resolve_mpv_exe, resolve_reporter_script};

use crate::mpv::window_host::{HostWindow, ParentHandle, PlayerRect};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// IPC-based mpv backend: spawns `mpv` and talks JSON over a dedicated IPC
/// socket. Uses `--input-ipc-server` (named pipe on Windows, unix socket
/// elsewhere) instead of stdin/stdout `fd://0`, which deadlocks when stdio is
/// piped separately.
pub struct MpvIpcBackend {
    inner: Arc<Mutex<Option<Inner>>>,
    settings: AppSettings,
    host: Arc<Mutex<Option<Arc<HostWindow>>>>,
    /// Native parent window the current host child is attached to. Used to make
    /// `bind_embedded` idempotent: re-attaching the same parent must NOT tear
    /// down a running session.
    current_parent: Arc<Mutex<Option<isize>>>,
    /// Serializes the destructive embedded-lifecycle operations (attach,
    /// the mpv spawn inside `ensure_started`, and detach) so a re-attach or
    /// detach can never kill the mpv child while a `play` is mid-spawn.
    lifecycle: Arc<AsyncMutex<()>>,
}

fn parent_key(parent: &ParentHandle) -> Option<isize> {
    match parent {
        #[cfg(target_os = "windows")]
        ParentHandle::Win32(handle) => Some(*handle),
        ParentHandle::Unsupported => None,
    }
}

struct Inner {
    child: Child,
    cmd_tx: mpsc::Sender<OutgoingCommand>,
}

struct OutgoingCommand {
    request_id: u64,
    payload: Value,
    reply: oneshot::Sender<Value>,
}

impl MpvIpcBackend {
    pub fn new(settings: AppSettings) -> Self {
        Self {
            inner: Arc::new(Mutex::new(None)),
            settings,
            host: Arc::new(Mutex::new(None)),
            current_parent: Arc::new(Mutex::new(None)),
            lifecycle: Arc::new(AsyncMutex::new(())),
        }
    }

    /// Create (or reuse) a native child window; mpv renders into it via `--wid`.
    ///
    /// Idempotent: when the same parent window already has a live host child,
    /// the existing host and any running mpv session are kept as-is. This is
    /// what stops PlayerView re-mounts (which call `embed_attach` every time)
    /// from killing an in-flight `play` and producing the
    /// "mpv ipc write failed: pipe is being closed" / black-screen race.
    pub async fn bind_embedded(&self, parent: ParentHandle) -> AppResult<()> {
        let _lifecycle = self.lifecycle.lock().await;
        let new_key = parent_key(&parent);

        let reuse = {
            let host_present = self.host.lock().is_some();
            let same_parent = *self.current_parent.lock() == new_key;
            host_present && same_parent
        };
        if reuse {
            return Ok(());
        }

        // Parent changed (or no host yet): stop mpv FIRST, then destroy the old
        // host window, so mpv never renders into a destroyed `--wid`.
        self.shutdown().await?;
        let old = {
            let mut guard = self.host.lock();
            guard.take()
        };
        if let Some(old) = old {
            let _ = old.destroy();
        }

        let host = Arc::new(HostWindow::create_child(parent)?);
        host.show(false)?;
        *self.host.lock() = Some(host);
        *self.current_parent.lock() = new_key;
        Ok(())
    }

    pub fn embed_rect(&self, rect: PlayerRect) -> AppResult<()> {
        let host = self.host.lock().as_ref().cloned();
        if let Some(h) = host {
            h.set_rect(rect)?;
        }
        Ok(())
    }

    pub fn embed_show(&self, visible: bool) -> AppResult<()> {
        let host = self.host.lock().as_ref().cloned();
        if let Some(h) = host {
            h.show(visible)?;
        }
        Ok(())
    }

    pub fn embed_window_handle(&self) -> Option<i64> {
        self.host.lock().as_ref().map(|h| h.handle())
    }

    /// Tear down mpv IPC and destroy the native child window.
    pub async fn detach_embedded(&self) -> AppResult<()> {
        let _lifecycle = self.lifecycle.lock().await;
        self.shutdown().await?;
        let host = {
            let mut guard = self.host.lock();
            guard.take()
        };
        *self.current_parent.lock() = None;
        if let Some(h) = host {
            h.destroy()?;
        }
        Ok(())
    }

    async fn ensure_started(&self) -> AppResult<()> {
        // Hot path: a live mpv session already exists. Stay lock-free so the
        // per-property snapshot fan-out is not serialized behind the lifecycle
        // lock.
        {
            let mut guard = self.inner.lock();
            if let Some(inner) = guard.as_mut() {
                match inner.child.try_wait() {
                    Ok(None) => return Ok(()),
                    Ok(Some(_status)) => {
                        guard.take();
                    }
                    Err(e) => return Err(AppError::Mpv(format!("mpv wait: {e}"))),
                }
            }
        }

        // Slow path: we must spawn mpv. Serialize with attach/detach so the
        // host child window cannot be destroyed underneath the spawning mpv
        // (`--wid`), and so a concurrent re-attach cannot kill this child.
        let _lifecycle = self.lifecycle.lock().await;

        // Another task may have started mpv while we waited for the lock.
        {
            let mut guard = self.inner.lock();
            if let Some(inner) = guard.as_mut() {
                match inner.child.try_wait() {
                    Ok(None) => return Ok(()),
                    Ok(Some(_status)) => {
                        guard.take();
                    }
                    Err(e) => return Err(AppError::Mpv(format!("mpv wait: {e}"))),
                }
            }
        }

        let settings = self.settings.clone();
        let wid = self.host.lock().as_ref().map(|h| h.wid()).ok_or_else(|| {
            AppError::Mpv(
                "embedded mpv host is not attached; refusing to launch standalone mpv window"
                    .into(),
            )
        })?;
        let (child, reader, writer) = spawn_mpv_ipc(&settings, wid).await?;
        let (cmd_tx, cmd_rx) = mpsc::channel::<OutgoingCommand>(64);
        let inner_ref = self.inner.clone();
        *self.inner.lock() = Some(Inner { child, cmd_tx });
        tokio::spawn(run_io(reader, writer, cmd_rx, inner_ref));
        Ok(())
    }

    fn is_stale_ipc(err: &AppError) -> bool {
        match err {
            AppError::Mpv(msg) => {
                msg.contains("channel closed")
                    || msg.contains("ipc send")
                    || msg.contains("ipc recv")
                    || msg.contains("mpv not started")
            }
            _ => false,
        }
    }

    async fn send_command_once_with_timeout(
        &self,
        args: Vec<Value>,
        reply_timeout: Duration,
    ) -> AppResult<Value> {
        self.ensure_started().await?;
        let req_id = next_id();
        let payload = json!({ "command": args, "request_id": req_id });

        let tx = {
            let g = self.inner.lock();
            g.as_ref()
                .ok_or_else(|| AppError::Mpv("mpv not started".into()))?
                .cmd_tx
                .clone()
        };

        let (reply_tx, reply_rx) = oneshot::channel();
        tx.send(OutgoingCommand {
            request_id: req_id,
            payload,
            reply: reply_tx,
        })
        .await
        .map_err(|e| AppError::Mpv(format!("ipc send: {e}")))?;

        let reply = timeout(reply_timeout, reply_rx)
            .await
            .map_err(|_| AppError::Mpv("mpv ipc timeout".into()))?
            .map_err(|e| AppError::Mpv(format!("ipc recv: {e}")))?;

        if reply.get("error").and_then(Value::as_str) == Some("success")
            || reply.get("error").is_none()
        {
            Ok(reply)
        } else {
            Err(AppError::Mpv(format!(
                "mpv error: {}",
                reply
                    .get("error")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown")
            )))
        }
    }

    async fn send_command_if_started_with_timeout(
        &self,
        args: Vec<Value>,
        reply_timeout: Duration,
    ) -> AppResult<Option<Value>> {
        let tx = {
            let mut guard = self.inner.lock();
            let Some(inner) = guard.as_mut() else {
                return Ok(None);
            };
            match inner.child.try_wait() {
                Ok(None) => inner.cmd_tx.clone(),
                Ok(Some(_status)) => {
                    guard.take();
                    return Ok(None);
                }
                Err(e) => return Err(AppError::Mpv(format!("mpv wait: {e}"))),
            }
        };

        let req_id = next_id();
        let payload = json!({ "command": args, "request_id": req_id });
        let (reply_tx, reply_rx) = oneshot::channel();
        tx.send(OutgoingCommand {
            request_id: req_id,
            payload,
            reply: reply_tx,
        })
        .await
        .map_err(|e| AppError::Mpv(format!("ipc send: {e}")))?;

        let reply = timeout(reply_timeout, reply_rx)
            .await
            .map_err(|_| AppError::Mpv("mpv ipc timeout".into()))?
            .map_err(|e| AppError::Mpv(format!("ipc recv: {e}")))?;

        if reply.get("error").and_then(Value::as_str) == Some("success")
            || reply.get("error").is_none()
        {
            Ok(Some(reply))
        } else {
            Err(AppError::Mpv(format!(
                "mpv error: {}",
                reply
                    .get("error")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown")
            )))
        }
    }

    async fn send_command_once(&self, args: Vec<Value>) -> AppResult<Value> {
        self.send_command_once_with_timeout(args, Duration::from_secs(5))
            .await
    }

    async fn send_command_with_timeout(
        &self,
        args: Vec<Value>,
        reply_timeout: Duration,
    ) -> AppResult<Value> {
        match self
            .send_command_once_with_timeout(args.clone(), reply_timeout)
            .await
        {
            Ok(v) => Ok(v),
            Err(e) if Self::is_stale_ipc(&e) => {
                self.shutdown().await?;
                self.send_command_once_with_timeout(args, reply_timeout)
                    .await
            }
            Err(e) => Err(e),
        }
    }

    async fn send_command(&self, args: Vec<Value>) -> AppResult<Value> {
        match self.send_command_once(args.clone()).await {
            Ok(v) => Ok(v),
            Err(e) if Self::is_stale_ipc(&e) => {
                self.shutdown().await?;
                self.send_command_once(args).await
            }
            Err(e) => Err(e),
        }
    }

    async fn get_property_with_timeout(
        &self,
        name: &str,
        reply_timeout: Duration,
    ) -> AppResult<Value> {
        let v = self
            .send_command_with_timeout(vec![json!("get_property"), json!(name)], reply_timeout)
            .await?;
        Ok(v.get("data").cloned().unwrap_or(Value::Null))
    }

    async fn current_time_pos_seconds(&self) -> Option<f64> {
        self.get_property_with_timeout("time-pos", Duration::from_millis(500))
            .await
            .ok()
            .and_then(|v| value_as_f64(&v))
            .filter(|v| v.is_finite() && *v >= 0.0)
    }

    fn relative_seek_moved(before: f64, after: Option<f64>, delta_seconds: f64) -> bool {
        let Some(after) = after else {
            return true;
        };
        if !after.is_finite() || delta_seconds.abs() < 0.001 {
            return true;
        }
        let threshold = (delta_seconds.abs() * 0.35).clamp(1.5, 12.0);
        if delta_seconds > 0.0 {
            after >= before + threshold
        } else {
            after <= (before - threshold).max(0.0)
        }
    }

    async fn clamp_seek_target_to_cached_range(&self, before: f64, target: f64) -> f64 {
        let Ok(cache_state) = self
            .get_property_with_timeout("demuxer-cache-state", Duration::from_millis(500))
            .await
        else {
            return target;
        };
        let Some(ranges) = cache_state.get("seekable-ranges").and_then(Value::as_array) else {
            return target;
        };
        for range in ranges {
            let Some(start) = range.get("start").and_then(value_as_f64) else {
                continue;
            };
            let Some(end) = range.get("end").and_then(value_as_f64) else {
                continue;
            };
            if !start.is_finite() || !end.is_finite() || end <= start {
                continue;
            }
            let before_in_range = before >= start - 0.5 && before <= end + 0.5;
            let target_in_range = target >= start && target <= end;
            if before_in_range || target_in_range {
                let min_target = (start + 0.25).min(end);
                let max_target = (end - 1.5).max(start);
                return target.clamp(min_target, max_target);
            }
        }
        target
    }

    async fn seek_relative_with_fallback(&self, delta_ms: i64) -> AppResult<()> {
        let before = self.current_time_pos_seconds().await;
        let delta_seconds = delta_ms as f64 / 1000.0;
        self.send_command(vec![
            json!("seek"),
            json!(delta_seconds),
            json!("relative+keyframes"),
        ])
        .await?;

        let Some(before) = before else {
            return Ok(());
        };
        tokio::time::sleep(Duration::from_millis(250)).await;
        if Self::relative_seek_moved(before, self.current_time_pos_seconds().await, delta_seconds) {
            return Ok(());
        }

        let unclamped_target = (before + delta_seconds).max(0.0);
        let target = self
            .clamp_seek_target_to_cached_range(before, unclamped_target)
            .await;
        self.send_command(vec![json!("seek"), json!(target), json!("absolute")])
            .await?;
        tokio::time::sleep(Duration::from_millis(250)).await;
        if Self::relative_seek_moved(before, self.current_time_pos_seconds().await, delta_seconds) {
            return Ok(());
        }

        self.send_command(vec![json!("seek"), json!(delta_seconds), json!("relative")])
            .await?;
        Ok(())
    }

    async fn set_property(&self, name: &str, value: Value) -> AppResult<()> {
        self.send_command(vec![json!("set_property"), json!(name), value])
            .await?;
        Ok(())
    }

    async fn drop_buffers_if_requested(&self, preserve_cache: bool) -> AppResult<()> {
        if preserve_cache {
            return Ok(());
        }
        if let Err(e) = self.send_command(vec![json!("drop-buffers")]).await {
            tracing::warn!(target = "mpv", error = %e, "drop-buffers failed after track switch");
        }
        Ok(())
    }

    async fn apply_anime4k_mode(&self, mode: Anime4kMode) -> AppResult<()> {
        let paths = resolve_mode_shader_paths(mode)?;
        if paths.is_empty() {
            self.send_command(vec![json!("change-list"), json!("glsl-shaders"), json!("clr"), json!("")])
                .await?;
        } else {
            let value = glsl_change_list_value(&paths);
            self.send_command(vec![
                json!("change-list"),
                json!("glsl-shaders"),
                json!("set"),
                json!(value),
            ])
            .await?;
        }
        Ok(())
    }
}

async fn spawn_mpv_ipc(
    settings: &AppSettings,
    wid: i64,
) -> AppResult<(
    Child,
    Box<dyn AsyncRead + Unpin + Send>,
    Box<dyn AsyncWrite + Unpin + Send>,
)> {
    let exe = resolve_mpv_exe();
    let exe_display = exe.display().to_string();

    let mut args: Vec<String> = vec![
        "--no-config".into(),
        "--idle=yes".into(),
        "--keep-open=yes".into(),
        "--no-terminal".into(),
        "--msg-level=all=warn".into(),
    ];

    args.push(format!("--wid={wid}"));
    args.push("--force-window=no".into());
    args.push("--title=Hills Lite".into());

    if settings.hardware_decoding {
        args.push("--hwdec=auto-safe".into());
    }
    if settings.mpv_cache_mb > 0 {
        args.push(format!("--cache=yes"));
        args.push(format!("--demuxer-max-bytes={}MiB", settings.mpv_cache_mb));
    }

    // Inject the progress reporter for parity with the external-mpv path. This
    // embedded/IPC backend leaves stdout on `Stdio::null()` and already drives
    // Emby reporting from the frontend snapshot loop, so the script's events are
    // harmlessly discarded here; the injection keeps every mpv launch path
    // loading the same bundled reporter.
    if let Some(script) = resolve_reporter_script() {
        args.push(format!("--script={}", script.display()));
    }

    #[cfg(windows)]
    {
        let pipe_name = format!("hills-lite-mpv-{}", uuid::Uuid::new_v4());
        let pipe_path = format!(r"\\.\pipe\{pipe_name}");

        args.push(format!("--input-ipc-server={pipe_path}"));

        let mut command = Command::new(&exe);
        command
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        let mut child = command
            .spawn()
            .map_err(|e| AppError::Mpv(format!("spawn mpv ({exe_display}): {e}")))?;

        let client = connect_mpv_pipe(&pipe_path, &mut child).await?;
        let (read, write) = tokio::io::split(client);
        Ok((child, Box::new(read), Box::new(write)))
    }

    #[cfg(not(windows))]
    {
        let socket_path =
            std::env::temp_dir().join(format!("hills-lite-mpv-{}.sock", uuid::Uuid::new_v4()));
        let _ = std::fs::remove_file(&socket_path);

        args.push(format!(
            "--input-ipc-server={}",
            socket_path.to_string_lossy()
        ));

        let mut command = Command::new(&exe);
        command
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        let mut child = command
            .spawn()
            .map_err(|e| AppError::Mpv(format!("spawn mpv ({exe_display}): {e}")))?;

        let conn = connect_mpv_socket(&socket_path, &mut child).await?;
        let (read, write) = tokio::io::split(conn);
        Ok((child, Box::new(read), Box::new(write)))
    }
}

#[cfg(windows)]
async fn connect_mpv_pipe(
    pipe_path: &str,
    child: &mut Child,
) -> AppResult<tokio::net::windows::named_pipe::NamedPipeClient> {
    use tokio::net::windows::named_pipe::ClientOptions;

    let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
    loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|e| AppError::Mpv(format!("mpv wait: {e}")))?
        {
            return Err(AppError::Mpv(format!(
                "mpv exited before ipc ready: {status}"
            )));
        }
        match ClientOptions::new().open(pipe_path) {
            Ok(client) => return Ok(client),
            Err(e) => {
                if tokio::time::Instant::now() >= deadline {
                    let _ = child.kill().await;
                    return Err(AppError::Mpv(format!("mpv ipc connect timeout: {e}")));
                }
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        }
    }
}

#[cfg(not(windows))]
async fn connect_mpv_socket(
    socket_path: &std::path::Path,
    child: &mut Child,
) -> AppResult<tokio::net::UnixStream> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
    loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|e| AppError::Mpv(format!("mpv wait: {e}")))?
        {
            return Err(AppError::Mpv(format!(
                "mpv exited before ipc ready: {status}"
            )));
        }
        match tokio::net::UnixStream::connect(socket_path).await {
            Ok(conn) => return Ok(conn),
            Err(e) => {
                if tokio::time::Instant::now() >= deadline {
                    let _ = child.kill().await;
                    return Err(AppError::Mpv(format!("mpv ipc connect timeout: {e}")));
                }
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        }
    }
}

fn next_id() -> u64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(1);
    COUNTER.fetch_add(1, Ordering::Relaxed)
}

async fn run_io<R, W>(
    reader: R,
    mut writer: W,
    mut cmd_rx: mpsc::Receiver<OutgoingCommand>,
    inner_ref: Arc<Mutex<Option<Inner>>>,
) where
    R: AsyncRead + Unpin + Send + 'static,
    W: AsyncWrite + Unpin + Send + 'static,
{
    let pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Value>>>> =
        Arc::new(Mutex::new(HashMap::new()));

    let pending_reader = pending.clone();
    let inner_for_read = inner_ref.clone();
    let read_task = tokio::spawn(async move {
        let mut lines = BufReader::new(reader).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }
            let v: Value = match serde_json::from_str(&line) {
                Ok(v) => v,
                Err(e) => {
                    tracing::warn!(target = "mpv-ipc", "parse err: {e} :: {line}");
                    continue;
                }
            };

            if let Some(id) = v.get("request_id").and_then(Value::as_u64) {
                if let Some(tx) = pending_reader.lock().remove(&id) {
                    let _ = tx.send(v);
                    continue;
                }
            }

            if let Some(event) = v.get("event").and_then(Value::as_str) {
                tracing::trace!(target = "mpv-ipc", "event: {event}");
            }
        }
        // mpv closed the IPC pipe — drop session so the next play respawns mpv.
        let dead_child = inner_for_read.lock().take().map(|inner| inner.child);
        if let Some(mut child) = dead_child {
            let _ = child.kill().await;
        }
    });

    while let Some(out) = cmd_rx.recv().await {
        pending.lock().insert(out.request_id, out.reply);
        let line = format!("{}\n", out.payload);
        if let Err(e) = writer.write_all(line.as_bytes()).await {
            tracing::warn!("mpv ipc write failed: {e}");
            if let Some(tx) = pending.lock().remove(&out.request_id) {
                let _ = tx.send(json!({ "error": e.to_string() }));
            }
            break;
        }
        let _ = writer.flush().await;
    }

    read_task.abort();
    let dead_child = inner_ref.lock().take().map(|inner| inner.child);
    if let Some(mut child) = dead_child {
        let _ = child.kill().await;
    }
}

#[async_trait]
impl MpvBackend for MpvIpcBackend {
    async fn execute(&self, cmd: MpvCommand) -> AppResult<()> {
        match cmd {
            MpvCommand::Load {
                url,
                headers,
                user_agent,
                start_ms,
                http_seekable,
                stream_record_path,
                autoload_subtitles,
            } => {
                self.set_property(
                    "sub-auto",
                    json!(if autoload_subtitles { "fuzzy" } else { "no" }),
                )
                .await?;
                if let Some(ua) = user_agent {
                    self.set_property("user-agent", json!(ua)).await?;
                }
                if !headers.is_empty() {
                    let hdr = headers
                        .iter()
                        .map(|(k, v)| format!("{k}: {v}"))
                        .collect::<Vec<_>>()
                        .join("\r\n");
                    self.set_property("http-header-fields", json!(hdr)).await?;
                }
                if let Some(ms) = start_ms {
                    self.set_property("start", json!(format!("{:.3}", ms as f64 / 1000.0)))
                        .await?;
                } else {
                    self.set_property("start", json!("0")).await?;
                }
                if let Some(rec) = stream_record_path {
                    self.set_property("stream-record", json!(rec)).await?;
                } else {
                    self.set_property("stream-record", json!("")).await.ok();
                }
                let mut args = vec![json!("loadfile"), json!(url), json!("replace")];
                if http_seekable == Some(false) {
                    args.push(json!(-1));
                    args.push(json!({
                        "demuxer-lavf-o": "seekable=0",
                    }));
                }
                self.send_command(args).await?;
                Ok(())
            }
            MpvCommand::Pause => self.set_property("pause", json!(true)).await,
            MpvCommand::Resume => self.set_property("pause", json!(false)).await,
            MpvCommand::Stop => {
                match self
                    .send_command_if_started_with_timeout(
                        vec![json!("stop")],
                        Duration::from_secs(2),
                    )
                    .await
                {
                    Ok(_) => {}
                    Err(e) if Self::is_stale_ipc(&e) => {
                        self.shutdown().await?;
                    }
                    Err(e) => return Err(e),
                }
                Ok(())
            }
            MpvCommand::Seek { position_ms } => {
                self.send_command(vec![
                    json!("seek"),
                    json!(position_ms as f64 / 1000.0),
                    json!("absolute"),
                ])
                .await?;
                Ok(())
            }
            MpvCommand::SeekRelative { delta_ms } => {
                self.seek_relative_with_fallback(delta_ms).await
            }
            MpvCommand::SetSpeed(s) => self.set_property("speed", json!(s)).await,
            MpvCommand::SetVolume(v) => self.set_property("volume", json!(v)).await,
            MpvCommand::SetMuted(m) => self.set_property("mute", json!(m)).await,
            MpvCommand::SetPictureMode(mode) => {
                let (keepaspect, panscan, zoom) = match mode {
                    PictureMode::Fit => (true, 0.0, 0.0),
                    PictureMode::Fill => (true, 1.0, 0.0),
                    PictureMode::Stretch => (false, 0.0, 0.0),
                    PictureMode::Autocrop => (true, 1.0, 0.16),
                };
                self.set_property("keepaspect", json!(keepaspect)).await?;
                self.set_property("panscan", json!(panscan)).await?;
                self.set_property("video-zoom", json!(zoom)).await?;
                self.set_property("video-scale-x", json!(1)).await?;
                self.set_property("video-scale-y", json!(1)).await?;
                self.set_property("video-aspect-override", json!(-2)).await
            }
            MpvCommand::SetAudioTrack { id, preserve_cache } => {
                self.set_property("aid", json!(id)).await?;
                self.drop_buffers_if_requested(preserve_cache).await
            }
            MpvCommand::SetSubtitleTrack { id, preserve_cache } => {
                self.set_property("sid", id.map_or_else(|| json!("no"), |id| json!(id)))
                    .await?;
                self.drop_buffers_if_requested(preserve_cache).await
            }
            MpvCommand::SetSecondarySubtitleTrack { id } => {
                self.set_property(
                    "secondary-sid",
                    id.map_or_else(|| json!("no"), |id| json!(id)),
                )
                .await?;
                self.set_property("secondary-sub-visibility", json!(id.is_some()))
                    .await
            }
            MpvCommand::AddSubtitle {
                source,
                title,
                lang,
                select,
            } => {
                let flag = if select { "select" } else { "auto" };
                let mut args = vec![json!("sub-add"), json!(source), json!(flag)];
                if let Some(t) = title {
                    args.push(json!(t));
                    if let Some(l) = lang {
                        args.push(json!(l));
                    }
                } else if let Some(l) = lang {
                    args.push(json!(""));
                    args.push(json!(l));
                }
                self.send_command(args).await?;
                Ok(())
            }
            MpvCommand::RemoveSubtitle(id) => {
                self.send_command(vec![json!("sub-remove"), json!(id)])
                    .await?;
                Ok(())
            }
            MpvCommand::SetSubtitleDelay(ms) => {
                self.set_property("sub-delay", json!(ms as f64 / 1000.0))
                    .await
            }
            MpvCommand::SetSubtitleScale(s) => self.set_property("sub-scale", json!(s)).await,
            MpvCommand::SetSubtitleStyle(style) => {
                self.set_property("sub-scale", json!(style.scale)).await?;
                self.set_property("sub-color", json!(style.text_color))
                    .await?;
                self.set_property("sub-outline-color", json!(style.outline_color))
                    .await?;
                self.set_property("sub-outline-size", json!(style.outline_size))
                    .await?;
                self.set_property("sub-shadow-offset", json!(style.shadow_offset))
                    .await?;
                self.set_property("sub-pos", json!(style.position_pct))
                    .await?;
                let ass_override = if style.force_style { "force" } else { "scale" };
                self.set_property("sub-ass-override", json!(ass_override))
                    .await
            }
            MpvCommand::CycleSubtitle => {
                self.send_command(vec![json!("cycle"), json!("sub")])
                    .await?;
                Ok(())
            }
            MpvCommand::ScreenshotToFile {
                path,
                include_subtitles,
            } => {
                let modes: &[&str] = if include_subtitles {
                    &["subtitles", "video", "window"]
                } else {
                    &["video", "window"]
                };
                let mut last_error = None;
                for mode in modes {
                    match self
                        .send_command(vec![json!("screenshot-to-file"), json!(path), json!(mode)])
                        .await
                    {
                        Ok(_) => return Ok(()),
                        Err(error) => {
                            last_error = Some(error);
                        }
                    }
                }
                Err(last_error.unwrap_or_else(|| AppError::Mpv("screenshot failed".into())))
            }
            MpvCommand::ShowStatsOsd { page } => {
                let page = page.clamp(1, 5);
                let binding = format!("stats/display-page-{page}");
                if self
                    .send_command(vec![json!("script-binding"), json!(binding)])
                    .await
                    .is_err()
                {
                    self.send_command(vec![json!("script-binding"), json!("stats/display-stats")])
                        .await?;
                }
                Ok(())
            }
            MpvCommand::SetAnime4kMode(mode) => self.apply_anime4k_mode(mode).await,
        }
    }

    async fn snapshot(&self) -> AppResult<MpvSnapshot> {
        let property_timeout = Duration::from_millis(900);
        macro_rules! property {
            ($name:literal) => {
                self.get_property_with_timeout($name, property_timeout)
            };
        }
        fn ok_value(result: AppResult<Value>) -> Option<Value> {
            result.ok()
        }
        fn value_string(result: AppResult<Value>) -> Option<String> {
            ok_value(result).and_then(|v| v.as_str().map(str::to_string))
        }

        let (
            path,
            pause,
            time_pos,
            duration,
            speed,
            volume,
            mute,
            eof_reached,
            track_list,
            chapter_list,
            chapter_value,
            secondary_sid,
            sub_delay_value,
            sub_scale_value,
            cache_speed,
            video_codec_value,
            audio_codec_value,
            video_params_value,
            video_out_params_value,
            osd_dimensions_value,
            audio_params_value,
            hwdec_current_value,
            idle_active_value,
            demuxer_value,
            file_format_value,
            media_title_value,
            stream_open_filename_value,
            stream_path_value,
            demuxer_cache_state_value,
            playlist_count_value,
            playlist_pos_value,
            container_fps_value,
            estimated_vf_fps_value,
            video_bitrate_value,
            audio_bitrate_value,
            frame_drop_count_value,
            decoder_frame_drop_count_value,
            vo_frame_drop_count_value,
            keepaspect_value,
            panscan_value,
            video_zoom_value,
            video_scale_x_value,
            video_scale_y_value,
            video_aspect_override_value,
        ) = tokio::join!(
            property!("path"),
            property!("pause"),
            property!("time-pos"),
            property!("duration"),
            property!("speed"),
            property!("volume"),
            property!("mute"),
            property!("eof-reached"),
            property!("track-list"),
            property!("chapter-list"),
            property!("chapter"),
            property!("secondary-sid"),
            property!("sub-delay"),
            property!("sub-scale"),
            property!("cache-speed"),
            property!("video-codec"),
            property!("audio-codec"),
            property!("video-params"),
            property!("video-out-params"),
            property!("osd-dimensions"),
            property!("audio-params"),
            property!("hwdec-current"),
            property!("idle-active"),
            property!("demuxer"),
            property!("file-format"),
            property!("media-title"),
            property!("stream-open-filename"),
            property!("stream-path"),
            property!("demuxer-cache-state"),
            property!("playlist-count"),
            property!("playlist-pos"),
            property!("container-fps"),
            property!("estimated-vf-fps"),
            property!("video-bitrate"),
            property!("audio-bitrate"),
            property!("frame-drop-count"),
            property!("decoder-frame-drop-count"),
            property!("vo-drop-frame-count"),
            property!("keepaspect"),
            property!("panscan"),
            property!("video-zoom"),
            property!("video-scale-x"),
            property!("video-scale-y"),
            property!("video-aspect-override")
        );

        let url = value_string(path);
        let paused = ok_value(pause).and_then(|v| v.as_bool()).unwrap_or(true);
        let position = ok_value(time_pos)
            .and_then(|v| value_as_f64(&v))
            .unwrap_or(0.0);
        let duration = ok_value(duration)
            .and_then(|v| value_as_f64(&v))
            .unwrap_or(0.0);
        let speed = ok_value(speed)
            .and_then(|v| value_as_f64(&v))
            .unwrap_or(1.0);
        let volume = ok_value(volume)
            .and_then(|v| value_as_f64(&v))
            .map(|x| x as i32)
            .unwrap_or(100);
        let muted = ok_value(mute).and_then(|v| v.as_bool()).unwrap_or(false);
        let eof = ok_value(eof_reached)
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let tracks_val = ok_value(track_list).unwrap_or(Value::Null);
        let tracks = parse_tracks(&tracks_val);
        let chapters_val = ok_value(chapter_list).unwrap_or(Value::Null);
        let chapters = parse_chapters(&chapters_val);
        let chapter = ok_value(chapter_value)
            .and_then(|v| value_as_i64(&v))
            .filter(|v| *v >= 0);
        let secondary_sub_id = ok_value(secondary_sid)
            .and_then(|v| match v {
                Value::Number(n) => n.as_i64(),
                Value::String(s) => s.parse::<i64>().ok(),
                _ => None,
            })
            .filter(|v| *v >= 0);
        let sub_delay = ok_value(sub_delay_value)
            .and_then(|v| value_as_f64(&v))
            .unwrap_or(0.0);
        let sub_scale = ok_value(sub_scale_value)
            .and_then(|v| value_as_f64(&v))
            .unwrap_or(1.0);
        let network_bps = ok_value(cache_speed)
            .and_then(|v| value_as_f64(&v))
            .filter(|v| v.is_finite() && *v >= 0.0);
        let video_codec = value_string(video_codec_value);
        let audio_codec = value_string(audio_codec_value);
        let video_params = ok_value(video_params_value).filter(Value::is_object);
        let video_out_params = ok_value(video_out_params_value).filter(Value::is_object);
        let osd_dimensions = ok_value(osd_dimensions_value).filter(Value::is_object);
        let audio_params = ok_value(audio_params_value).filter(Value::is_object);
        let hwdec_current = value_string(hwdec_current_value);
        let idle_active = ok_value(idle_active_value).and_then(|v| v.as_bool());
        let demuxer = value_string(demuxer_value);
        let file_format = value_string(file_format_value);
        let media_title = value_string(media_title_value);
        let stream_open_filename = value_string(stream_open_filename_value);
        let stream_path = value_string(stream_path_value);
        let demuxer_cache_state = ok_value(demuxer_cache_state_value).filter(Value::is_object);
        let playlist_count = ok_value(playlist_count_value).and_then(|v| value_as_i64(&v));
        let playlist_pos = ok_value(playlist_pos_value).and_then(|v| value_as_i64(&v));
        let container_fps = ok_value(container_fps_value).and_then(|v| value_as_f64(&v));
        let estimated_vf_fps = ok_value(estimated_vf_fps_value).and_then(|v| value_as_f64(&v));
        let video_bitrate = ok_value(video_bitrate_value).and_then(|v| value_as_f64(&v));
        let audio_bitrate = ok_value(audio_bitrate_value).and_then(|v| value_as_f64(&v));
        let frame_drop_count = ok_value(frame_drop_count_value).and_then(|v| value_as_f64(&v));
        let decoder_frame_drop_count =
            ok_value(decoder_frame_drop_count_value).and_then(|v| value_as_f64(&v));
        let vo_frame_drop_count =
            ok_value(vo_frame_drop_count_value).and_then(|v| value_as_f64(&v));
        let keepaspect = ok_value(keepaspect_value).and_then(|v| v.as_bool());
        let panscan = ok_value(panscan_value).and_then(|v| value_as_f64(&v));
        let video_zoom = ok_value(video_zoom_value).and_then(|v| value_as_f64(&v));
        let video_scale_x = ok_value(video_scale_x_value).and_then(|v| value_as_f64(&v));
        let video_scale_y = ok_value(video_scale_y_value).and_then(|v| value_as_f64(&v));
        let video_aspect_override =
            ok_value(video_aspect_override_value).and_then(|v| value_as_f64(&v));

        Ok(MpvSnapshot {
            url,
            paused,
            position_ms: (position * 1000.0) as i64,
            duration_ms: (duration * 1000.0) as i64,
            speed,
            volume,
            muted,
            eof,
            tracks,
            chapters,
            chapter,
            secondary_sub_id,
            sub_delay_ms: (sub_delay * 1000.0) as i64,
            sub_scale,
            network_bps,
            video_codec,
            audio_codec,
            video_params,
            video_out_params,
            osd_dimensions,
            audio_params,
            hwdec_current,
            idle_active,
            demuxer,
            file_format,
            media_title,
            stream_open_filename,
            stream_path,
            demuxer_cache_state,
            playlist_count,
            playlist_pos,
            keepaspect,
            panscan,
            video_zoom,
            video_scale_x,
            video_scale_y,
            video_aspect_override,
            container_fps,
            estimated_vf_fps,
            video_bitrate,
            audio_bitrate,
            frame_drop_count,
            decoder_frame_drop_count,
            vo_frame_drop_count,
            backend_diagnostics: None,
        })
    }

    async fn shutdown(&self) -> AppResult<()> {
        let inner_opt = self.inner.lock().take();
        if let Some(mut inner) = inner_opt {
            let pid = inner.child.id();
            // Drop the command channel first so the IO task exits cleanly.
            drop(inner.cmd_tx);
            if let Err(e) = inner.child.start_kill() {
                tracing::warn!(target = "mpv", error = %e, pid = ?pid, "mpv process kill signal failed during shutdown");
            }
            match timeout(Duration::from_secs(2), inner.child.wait()).await {
                Ok(Ok(_)) => {}
                Ok(Err(e)) => {
                    tracing::warn!(target = "mpv", error = %e, pid = ?pid, "mpv process wait during shutdown failed");
                }
                Err(_) => {
                    tracing::warn!(target = "mpv", pid = ?pid, "mpv process wait during shutdown timed out");
                    force_kill_process_tree(pid);
                    if let Err(e) = inner.child.kill().await {
                        tracing::warn!(target = "mpv", error = %e, pid = ?pid, "mpv process force kill failed during shutdown");
                    }
                    match timeout(Duration::from_secs(2), inner.child.wait()).await {
                        Ok(Ok(_)) => {}
                        Ok(Err(e)) => {
                            tracing::warn!(target = "mpv", error = %e, pid = ?pid, "mpv process wait after force kill failed");
                        }
                        Err(_) => {
                            tracing::error!(target = "mpv", pid = ?pid, "mpv process survived force kill");
                        }
                    }
                }
            }
        }
        Ok(())
    }
}

#[cfg(windows)]
fn force_kill_process_tree(pid: Option<u32>) {
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let Some(pid) = pid else {
        return;
    };
    let status = StdCommand::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .status();
    if let Err(e) = status {
        tracing::warn!(target = "mpv", error = %e, pid, "taskkill fallback failed");
    }
}

#[cfg(not(windows))]
fn force_kill_process_tree(_pid: Option<u32>) {}

fn parse_tracks(v: &Value) -> Vec<MpvTrackInfo> {
    let Some(arr) = v.as_array() else {
        return vec![];
    };
    arr.iter()
        .filter_map(|t| {
            let id = t.get("id")?.as_i64()?;
            let type_str = t.get("type")?.as_str()?;
            let kind = match type_str {
                "video" => TrackKind::Video,
                "audio" => TrackKind::Audio,
                "sub" => TrackKind::Subtitle,
                _ => return None,
            };
            let title = t.get("title").and_then(|v| v.as_str().map(str::to_string));
            let lang = t.get("lang").and_then(|v| v.as_str().map(str::to_string));
            let codec = t.get("codec").and_then(|v| v.as_str().map(str::to_string));
            let external = t.get("external").and_then(Value::as_bool);
            let default_track = t.get("default").and_then(Value::as_bool);
            let forced = t.get("forced").and_then(Value::as_bool);
            let selected = t.get("selected").and_then(Value::as_bool).unwrap_or(false);
            Some(MpvTrackInfo {
                id,
                kind,
                title,
                lang,
                codec,
                external,
                default_track,
                forced,
                selected,
            })
        })
        .collect()
}

fn parse_chapters(v: &Value) -> Vec<MpvChapterInfo> {
    let Some(arr) = v.as_array() else {
        return vec![];
    };
    arr.iter()
        .enumerate()
        .filter_map(|(index, chapter)| {
            let time = chapter.get("time").and_then(value_as_f64)?;
            if !time.is_finite() || time < 0.0 {
                return None;
            }
            let title = chapter
                .get("title")
                .and_then(|v| v.as_str().map(str::to_string));
            Some(MpvChapterInfo {
                index: index as i64,
                title,
                time_ms: (time * 1000.0) as i64,
            })
        })
        .collect()
}

fn value_as_f64(v: &Value) -> Option<f64> {
    v.as_f64().or_else(|| v.as_i64().map(|n| n as f64))
}

fn value_as_i64(v: &Value) -> Option<i64> {
    v.as_i64()
}
