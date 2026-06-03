use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use parking_lot::Mutex;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot};
use tokio::time::timeout;

use crate::config::models::AppSettings;
use crate::error::{AppError, AppResult};
use crate::mpv::backend::{
    MpvBackend, MpvChapterInfo, MpvCommand, MpvSnapshot, MpvTrackInfo, PictureMode, TrackKind,
};
use crate::mpv::paths::resolve_mpv_exe;

use crate::mpv::window_host::{HostWindow, ParentHandle, PlayerRect};

/// IPC-based mpv backend: spawns `mpv` and talks JSON over a dedicated IPC
/// socket. Uses `--input-ipc-server` (named pipe on Windows, unix socket
/// elsewhere) instead of stdin/stdout `fd://0`, which deadlocks when stdio is
/// piped separately.
pub struct MpvIpcBackend {
    inner: Arc<Mutex<Option<Inner>>>,
    settings: AppSettings,
    host: Arc<Mutex<Option<HostWindow>>>,
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
        }
    }

    /// Create a native child window; mpv renders into it via `--wid`.
    pub fn bind_embedded(&self, parent: ParentHandle) -> AppResult<()> {
        if let Some(mut inner) = self.inner.lock().take() {
            drop(inner.cmd_tx);
            let _ = inner.child.start_kill();
        }
        let mut guard = self.host.lock();
        if let Some(old) = guard.take() {
            let _ = old.destroy();
        }
        let host = HostWindow::create_child(parent)?;
        host.show(false)?;
        *guard = Some(host);
        Ok(())
    }

    pub fn embed_rect(&self, rect: PlayerRect) -> AppResult<()> {
        if let Some(h) = self.host.lock().as_ref() {
            h.set_rect(rect)?;
        }
        Ok(())
    }

    pub fn embed_show(&self, visible: bool) -> AppResult<()> {
        if let Some(h) = self.host.lock().as_ref() {
            h.show(visible)?;
        }
        Ok(())
    }

    /// Tear down mpv IPC and destroy the native child window.
    pub async fn detach_embedded(&self) -> AppResult<()> {
        self.shutdown().await?;
        let mut guard = self.host.lock();
        if let Some(h) = guard.take() {
            h.destroy()?;
        }
        Ok(())
    }

    async fn ensure_started(&self) -> AppResult<()> {
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
        let wid = self.host.lock().as_ref().map(|h| h.wid());
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

    async fn send_command_once(&self, args: Vec<Value>) -> AppResult<Value> {
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

        let reply = timeout(Duration::from_secs(5), reply_rx)
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

    async fn get_property(&self, name: &str) -> AppResult<Value> {
        let v = self
            .send_command(vec![json!("get_property"), json!(name)])
            .await?;
        Ok(v.get("data").cloned().unwrap_or(Value::Null))
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
}

async fn spawn_mpv_ipc(
    settings: &AppSettings,
    wid: Option<i64>,
) -> AppResult<(
    Child,
    Box<dyn AsyncRead + Unpin + Send>,
    Box<dyn AsyncWrite + Unpin + Send>,
)> {
    let exe = resolve_mpv_exe();
    let exe_display = exe.display().to_string();

    let mut args: Vec<String> = vec![
        "--idle=yes".into(),
        "--keep-open=yes".into(),
        "--no-terminal".into(),
        "--msg-level=all=warn".into(),
    ];

    if let Some(wid) = wid {
        args.push(format!("--wid={wid}"));
        args.push("--force-window=no".into());
    } else {
        args.push("--force-window=yes".into());
    }
    args.push("--title=Hills Lite".into());

    if settings.hardware_decoding {
        args.push("--hwdec=auto-safe".into());
    }
    if settings.mpv_cache_mb > 0 {
        args.push(format!("--cache=yes"));
        args.push(format!("--demuxer-max-bytes={}MiB", settings.mpv_cache_mb));
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
                }
                if let Some(rec) = stream_record_path {
                    self.set_property("stream-record", json!(rec)).await?;
                } else {
                    self.set_property("stream-record", json!("")).await.ok();
                }
                self.send_command(vec![json!("loadfile"), json!(url), json!("replace")])
                    .await?;
                Ok(())
            }
            MpvCommand::Pause => self.set_property("pause", json!(true)).await,
            MpvCommand::Resume => self.set_property("pause", json!(false)).await,
            MpvCommand::Stop => {
                self.send_command(vec![json!("stop")]).await?;
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
                self.send_command(vec![
                    json!("seek"),
                    json!(delta_ms as f64 / 1000.0),
                    json!("relative+keyframes"),
                ])
                .await?;
                Ok(())
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
                let mode = if include_subtitles {
                    "subtitles"
                } else {
                    "video"
                };
                self.send_command(vec![json!("screenshot-to-file"), json!(path), json!(mode)])
                    .await?;
                Ok(())
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
        }
    }

    async fn snapshot(&self) -> AppResult<MpvSnapshot> {
        let url = self
            .get_property("path")
            .await
            .ok()
            .and_then(|v| v.as_str().map(str::to_string));
        let paused = self
            .get_property("pause")
            .await
            .ok()
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        let position = self
            .get_property("time-pos")
            .await
            .ok()
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let duration = self
            .get_property("duration")
            .await
            .ok()
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let speed = self
            .get_property("speed")
            .await
            .ok()
            .and_then(|v| v.as_f64())
            .unwrap_or(1.0);
        let volume = self
            .get_property("volume")
            .await
            .ok()
            .and_then(|v| v.as_f64())
            .map(|x| x as i32)
            .unwrap_or(100);
        let muted = self
            .get_property("mute")
            .await
            .ok()
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let eof = self
            .get_property("eof-reached")
            .await
            .ok()
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let tracks_val = self.get_property("track-list").await.unwrap_or(Value::Null);
        let tracks = parse_tracks(&tracks_val);
        let chapters_val = self
            .get_property("chapter-list")
            .await
            .unwrap_or(Value::Null);
        let chapters = parse_chapters(&chapters_val);
        let chapter = self
            .get_property("chapter")
            .await
            .ok()
            .and_then(|v| v.as_i64())
            .filter(|v| *v >= 0);
        let secondary_sub_id = self
            .get_property("secondary-sid")
            .await
            .ok()
            .and_then(|v| match v {
                Value::Number(n) => n.as_i64(),
                Value::String(s) => s.parse::<i64>().ok(),
                _ => None,
            })
            .filter(|v| *v >= 0);
        let sub_delay = self
            .get_property("sub-delay")
            .await
            .ok()
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let sub_scale = self
            .get_property("sub-scale")
            .await
            .ok()
            .and_then(|v| v.as_f64())
            .unwrap_or(1.0);
        let network_bps = self
            .get_property("cache-speed")
            .await
            .ok()
            .and_then(|v| value_as_f64(&v))
            .filter(|v| v.is_finite() && *v >= 0.0);
        let video_codec = self
            .get_property("video-codec")
            .await
            .ok()
            .and_then(|v| v.as_str().map(str::to_string));
        let audio_codec = self
            .get_property("audio-codec")
            .await
            .ok()
            .and_then(|v| v.as_str().map(str::to_string));
        let video_params = self
            .get_property("video-params")
            .await
            .ok()
            .filter(Value::is_object);
        let video_out_params = self
            .get_property("video-out-params")
            .await
            .ok()
            .filter(Value::is_object);
        let osd_dimensions = self
            .get_property("osd-dimensions")
            .await
            .ok()
            .filter(Value::is_object);
        let audio_params = self
            .get_property("audio-params")
            .await
            .ok()
            .filter(Value::is_object);
        let hwdec_current = self
            .get_property("hwdec-current")
            .await
            .ok()
            .and_then(|v| v.as_str().map(str::to_string));
        let container_fps = self
            .get_property("container-fps")
            .await
            .ok()
            .and_then(|v| value_as_f64(&v));
        let estimated_vf_fps = self
            .get_property("estimated-vf-fps")
            .await
            .ok()
            .and_then(|v| value_as_f64(&v));
        let video_bitrate = self
            .get_property("video-bitrate")
            .await
            .ok()
            .and_then(|v| value_as_f64(&v));
        let audio_bitrate = self
            .get_property("audio-bitrate")
            .await
            .ok()
            .and_then(|v| value_as_f64(&v));
        let frame_drop_count = self
            .get_property("frame-drop-count")
            .await
            .ok()
            .and_then(|v| value_as_f64(&v));
        let decoder_frame_drop_count = self
            .get_property("decoder-frame-drop-count")
            .await
            .ok()
            .and_then(|v| value_as_f64(&v));
        let vo_frame_drop_count = self
            .get_property("vo-drop-frame-count")
            .await
            .ok()
            .and_then(|v| value_as_f64(&v));
        let keepaspect = self
            .get_property("keepaspect")
            .await
            .ok()
            .and_then(|v| v.as_bool());
        let panscan = self
            .get_property("panscan")
            .await
            .ok()
            .and_then(|v| value_as_f64(&v));
        let video_zoom = self
            .get_property("video-zoom")
            .await
            .ok()
            .and_then(|v| value_as_f64(&v));
        let video_scale_x = self
            .get_property("video-scale-x")
            .await
            .ok()
            .and_then(|v| value_as_f64(&v));
        let video_scale_y = self
            .get_property("video-scale-y")
            .await
            .ok()
            .and_then(|v| value_as_f64(&v));
        let video_aspect_override = self
            .get_property("video-aspect-override")
            .await
            .ok()
            .and_then(|v| value_as_f64(&v));

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
            // Drop the command channel first so the IO task exits cleanly.
            drop(inner.cmd_tx);
            let _ = inner.child.kill().await;
            let _ = inner.child.wait().await;
        }
        Ok(())
    }
}

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
