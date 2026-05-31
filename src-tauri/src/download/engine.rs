use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use futures::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, RANGE, USER_AGENT};
use reqwest::StatusCode;
use tauri::{AppHandle, Emitter};
use tokio::fs::{File, OpenOptions};
use tokio::io::AsyncWriteExt;
use tokio::sync::watch;
use tokio::time::sleep;

use crate::config::models::{Account, Line, Server};
use crate::config::ConfigStore;
use crate::download::stealth::StealthReporter;
use crate::download::task::{DownloadStatus, DownloadTask};
use crate::emby::EmbyClient;
use crate::error::{AppError, AppResult};
use crate::notifications::{
    NotificationAction, NotificationCategory, NotificationCenter, NotificationKind,
    NotificationSpec,
};
use serde_json::json;

const EVENT_PROGRESS: &str = "download:progress";
const EVENT_STATE: &str = "download:state";
const FLUSH_INTERVAL_BYTES: u64 = 4 * 1024 * 1024;
const FLUSH_INTERVAL_MS: u64 = 750;
const MAX_TRANSIENT_RETRIES: u32 = 5;
const RETRY_BASE_MS: u64 = 800;
const RETRY_MAX_MS: u64 = 15_000;

#[derive(Debug, Clone)]
pub enum ControlSignal {
    Run,
    Pause,
    Cancel,
}

pub struct DownloadEngine {
    pub config: ConfigStore,
    pub emby: EmbyClient,
    pub handle: AppHandle,
    pub notifications: NotificationCenter,
}

impl DownloadEngine {
    pub fn new(
        config: ConfigStore,
        emby: EmbyClient,
        handle: AppHandle,
        notifications: NotificationCenter,
    ) -> Self {
        Self {
            config,
            emby,
            handle,
            notifications,
        }
    }

    /// Drive the task to completion. Honors `control_rx` for pause / cancel.
    /// Performs bounded retry on transient network errors with exponential
    /// back-off, resuming from the current file length each attempt. The
    /// stealth reporter is started / stopped to match the actual running
    /// state so the Emby session never reports progress while paused.
    pub async fn run_task(
        self: Arc<Self>,
        task_id: String,
        mut control_rx: watch::Receiver<ControlSignal>,
    ) -> AppResult<()> {
        let mut task = self
            .config
            .download(&task_id)
            .ok_or_else(|| AppError::NotFound(task_id.clone()))?;

        let server = self
            .config
            .server(&task.server_id)
            .ok_or_else(|| AppError::NotFound(task.server_id.clone()))?;
        let account = self
            .config
            .account(&task.account_id)
            .ok_or_else(|| AppError::NotFound(task.account_id.clone()))?;

        let line = pick_line(&server)?;

        if let Some(parent) = Path::new(&task.file_path).parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        self.update_status(&mut task, DownloadStatus::Running, None)
            .await?;

        let stealth = if task.stealth {
            Some(StealthReporter::start(
                self.emby.clone(),
                server.clone(),
                account.clone(),
                task.item_id.clone(),
                task.play_session_id.clone(),
                self.config
                    .settings()
                    .heartbeat_interval_secs
                    .min(20)
                    .max(5),
            ))
        } else {
            None
        };

        let mut transient_failures: u32 = 0;
        let final_state = loop {
            let attempt = self
                .single_attempt(&mut task, &server, &line, &account, &mut control_rx)
                .await;

            match attempt {
                Ok(LoopEnd::Done) => break Ok(LoopEnd::Done),
                Ok(other) => break Ok(other),
                Err(err) if is_transient(&err) && transient_failures < MAX_TRANSIENT_RETRIES => {
                    transient_failures += 1;
                    let delay_ms = (RETRY_BASE_MS * (1u64 << (transient_failures - 1).min(6)))
                        .min(RETRY_MAX_MS);
                    tracing::warn!(
                        target = "download",
                        task = %task.id,
                        attempt = transient_failures,
                        delay_ms,
                        error = %err,
                        "transient error, retrying"
                    );
                    self.update_status(
                        &mut task,
                        DownloadStatus::Running,
                        Some(format!(
                            "retry {transient_failures}/{MAX_TRANSIENT_RETRIES}: {err}"
                        )),
                    )
                    .await?;
                    if sleep_with_cancel(&mut control_rx, Duration::from_millis(delay_ms)).await {
                        break Ok(LoopEnd::Cancelled);
                    }
                }
                Err(err) => break Err(err),
            }
        };

        if let Some(s) = stealth {
            let virtual_ticks = s.virtual_ticks();
            s.stop().await;
            // Cleanly close the stealth session on the server so it doesn't
            // hang around as a phantom active session. Best effort.
            let _ = self
                .emby
                .report_stopped(
                    &server,
                    &account,
                    &task.item_id,
                    &task.play_session_id,
                    virtual_ticks,
                )
                .await;
        }

        match final_state {
            Ok(LoopEnd::Done) => {
                if let Some(expected) = task.total_bytes {
                    let got = task.downloaded_bytes;
                    if got < expected {
                        self.update_status(
                            &mut task,
                            DownloadStatus::Failed,
                            Some(format!("truncated: got {}, expected {}", got, expected)),
                        )
                        .await?;
                        return Ok(());
                    }
                }
                self.update_status(&mut task, DownloadStatus::Completed, None)
                    .await?;
            }
            Ok(LoopEnd::Paused) => {
                self.update_status(&mut task, DownloadStatus::Paused, None)
                    .await?;
            }
            Ok(LoopEnd::Cancelled) => {
                self.update_status(&mut task, DownloadStatus::Cancelled, None)
                    .await?;
            }
            Err(e) => {
                self.update_status(&mut task, DownloadStatus::Failed, Some(e.to_string()))
                    .await?;
            }
        }
        Ok(())
    }

    async fn single_attempt(
        &self,
        task: &mut DownloadTask,
        server: &Server,
        line: &Line,
        account: &Account,
        control_rx: &mut watch::Receiver<ControlSignal>,
    ) -> AppResult<LoopEnd> {
        let mut headers = build_headers(server, line, account, &self.config)?;

        let mut file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .open(&task.file_path)
            .await?;
        let existing = file.metadata().await?.len();
        task.downloaded_bytes = existing;
        if existing > 0 {
            headers.insert(
                RANGE,
                HeaderValue::from_str(&format!("bytes={existing}-"))
                    .map_err(|e| AppError::Other(e.to_string()))?,
            );
            file.set_len(existing).await?;
            use tokio::io::AsyncSeekExt;
            file.seek(std::io::SeekFrom::Start(existing)).await?;
        }

        self.download_loop(task, &mut file, line, headers, control_rx)
            .await
    }

    async fn download_loop(
        &self,
        task: &mut DownloadTask,
        file: &mut File,
        line: &Line,
        headers: HeaderMap,
        control_rx: &mut watch::Receiver<ControlSignal>,
    ) -> AppResult<LoopEnd> {
        let url = task.stream_url.clone();
        let req = self.emby.http().get(&url).headers(headers);
        let resp = req.send().await?;
        let status = resp.status();
        if status == StatusCode::RANGE_NOT_SATISFIABLE {
            return Ok(LoopEnd::Done);
        }
        if !status.is_success() && status != StatusCode::PARTIAL_CONTENT {
            return Err(AppError::Other(format!("HTTP {status}")));
        }

        if task.total_bytes.is_none() {
            task.total_bytes = parse_total_size(resp.headers(), task.downloaded_bytes);
        }

        let mut stream = resp.bytes_stream();
        let mut buf_since_flush: u64 = 0;
        let mut last_flush = std::time::Instant::now();

        loop {
            // Wait either for the next chunk or a control change so pause /
            // cancel react immediately without buffering more bytes.
            tokio::select! {
                changed = control_rx.changed() => {
                    if changed.is_err() {
                        // Sender dropped: behave as cancel.
                        let _ = file.flush().await;
                        return Ok(LoopEnd::Cancelled);
                    }
                    let signal = control_rx.borrow().clone();
                    match signal {
                        ControlSignal::Pause => {
                            let _ = file.flush().await;
                            self.emit_progress(task);
                            return Ok(LoopEnd::Paused);
                        }
                        ControlSignal::Cancel => {
                            let _ = file.flush().await;
                            return Ok(LoopEnd::Cancelled);
                        }
                        ControlSignal::Run => continue,
                    }
                }
                next = stream.next() => {
                    let chunk = match next {
                        Some(Ok(c)) => c,
                        Some(Err(e)) => return Err(AppError::from(e)),
                        None => break,
                    };

                    file.write_all(&chunk).await?;
                    task.downloaded_bytes += chunk.len() as u64;
                    buf_since_flush += chunk.len() as u64;

                    if buf_since_flush >= FLUSH_INTERVAL_BYTES
                        || last_flush.elapsed() >= Duration::from_millis(FLUSH_INTERVAL_MS)
                    {
                        let _ = file.flush().await;
                        buf_since_flush = 0;
                        last_flush = std::time::Instant::now();
                        self.emit_progress(task);
                        let _ = self.config.upsert_download(task.clone());
                    }

                    if chunk.len() < 4096 {
                        sleep(Duration::from_micros(50)).await;
                    }
                }
            }
            let _ = line;
        }

        let _ = file.flush().await;
        self.emit_progress(task);
        Ok(LoopEnd::Done)
    }

    fn emit_progress(&self, task: &DownloadTask) {
        let _ = self.handle.emit(
            EVENT_PROGRESS,
            serde_json::json!({
                "id": task.id,
                "downloadedBytes": task.downloaded_bytes,
                "totalBytes": task.total_bytes,
            }),
        );
    }

    async fn update_status(
        &self,
        task: &mut DownloadTask,
        status: DownloadStatus,
        error: Option<String>,
    ) -> AppResult<()> {
        let prev = task.status;
        task.status = status;
        task.error = error.clone();
        task.updated_at = Utc::now();
        self.config.upsert_download(task.clone())?;
        let _ = self.handle.emit(EVENT_STATE, task.clone());

        // Only fire notifications on terminal transitions (and not on
        // intermediate retry status updates). The download is at a stable
        // resting state in these three cases.
        if prev != status {
            match status {
                DownloadStatus::Completed => {
                    let _ = self.notifications.push(
                        NotificationSpec::new(
                            NotificationKind::Success,
                            NotificationCategory::Download,
                            format!("{} 下载完成", task.title),
                        )
                        .action(NotificationAction {
                            kind: "open-task".to_string(),
                            label: "本地播放".to_string(),
                            payload: json!({ "taskId": task.id }),
                        })
                        .source(task.id.clone()),
                    );
                }
                DownloadStatus::Failed => {
                    let _ = self.notifications.push(
                        NotificationSpec::new(
                            NotificationKind::Error,
                            NotificationCategory::Download,
                            format!("{} 下载失败", task.title),
                        )
                        .body(error.unwrap_or_else(|| "未知错误".into()))
                        .sticky()
                        .source(task.id.clone()),
                    );
                }
                DownloadStatus::Cancelled => {
                    let _ = self.notifications.push(
                        NotificationSpec::new(
                            NotificationKind::Info,
                            NotificationCategory::Download,
                            format!("{} 已取消", task.title),
                        )
                        .source(task.id.clone()),
                    );
                }
                _ => {}
            }
        }
        Ok(())
    }
}

#[derive(Debug)]
enum LoopEnd {
    Done,
    Paused,
    Cancelled,
}

fn pick_line(server: &Server) -> AppResult<Line> {
    if let Some(id) = &server.active_line_id {
        if let Some(l) = server.lines.iter().find(|l| &l.id == id && l.enabled) {
            return Ok(l.clone());
        }
    }
    server
        .lines
        .iter()
        .find(|l| l.enabled)
        .cloned()
        .ok_or_else(|| AppError::NoLine(server.id.clone()))
}

fn build_headers(
    server: &Server,
    line: &Line,
    account: &Account,
    config: &ConfigStore,
) -> AppResult<HeaderMap> {
    let settings = config.settings();
    let ua = line
        .user_agent
        .clone()
        .or_else(|| server.default_user_agent.clone())
        .unwrap_or(settings.default_user_agent.clone());

    let mut h = HeaderMap::new();
    h.insert(
        USER_AGENT,
        HeaderValue::from_str(&ua).map_err(|e| AppError::Other(e.to_string()))?,
    );
    h.insert(
        HeaderName::from_static("x-emby-token"),
        HeaderValue::from_str(&account.access_token).map_err(|e| AppError::Other(e.to_string()))?,
    );
    h.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("MediaBrowser Token=\"{}\"", account.access_token))
            .map_err(|e| AppError::Other(e.to_string()))?,
    );
    for (k, v) in &line.headers {
        let name = HeaderName::from_bytes(k.as_bytes())
            .map_err(|e| AppError::Other(format!("bad header name: {e}")))?;
        let val = HeaderValue::from_str(v).map_err(|e| AppError::Other(e.to_string()))?;
        h.insert(name, val);
    }
    Ok(h)
}

fn is_transient(err: &AppError) -> bool {
    let s = err.to_string().to_lowercase();
    s.contains("timeout")
        || s.contains("timed out")
        || s.contains("connection reset")
        || s.contains("connection refused")
        || s.contains("connection closed")
        || s.contains("eof")
        || s.contains("broken pipe")
        || s.contains("connection aborted")
        || s.contains("os error 10054")
        || s.contains("os error 10060")
        || s.contains("503")
        || s.contains("502")
        || s.contains("504")
        || s.contains("520")
        || s.contains("521")
        || s.contains("522")
        || s.contains("523")
        || s.contains("524")
        || s.contains("dns")
}

/// Sleep for `delay`, returning early if a Cancel signal arrives. Returns
/// `true` if cancelled.
async fn sleep_with_cancel(
    control_rx: &mut watch::Receiver<ControlSignal>,
    delay: Duration,
) -> bool {
    tokio::select! {
        _ = sleep(delay) => false,
        changed = control_rx.changed() => {
            if changed.is_err() { return true; }
            matches!(*control_rx.borrow(), ControlSignal::Cancel)
        }
    }
}

fn parse_total_size(headers: &HeaderMap, fallback: u64) -> Option<u64> {
    if let Some(cr) = headers.get("content-range") {
        if let Ok(s) = cr.to_str() {
            if let Some(slash) = s.rfind('/') {
                if let Ok(n) = s[slash + 1..].trim().parse::<u64>() {
                    return Some(n);
                }
            }
        }
    }
    if let Some(cl) = headers.get(reqwest::header::CONTENT_LENGTH) {
        if let Ok(s) = cl.to_str() {
            if let Ok(n) = s.parse::<u64>() {
                return Some(fallback + n);
            }
        }
    }
    None
}
