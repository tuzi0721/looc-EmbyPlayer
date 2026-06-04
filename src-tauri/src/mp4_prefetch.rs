//! Prefetch cache for Range-broken, non-faststart MP4/MOV sources.
//!
//! Some servers (often behind a reverse proxy / CDN) serve their original MP4
//! with HTTP `200` and no `Content-Range`, i.e. they do not honor HTTP Range.
//! When such a file is also not faststart (its `moov` index atom is at the tail
//! instead of the front), mpv cannot seek to the tail to read the index and the
//! player stays black. The server cannot help either, because Hills Lite never
//! asks it to transcode/remux.
//!
//! The only robust fix without server transcoding is to download the file
//! sequentially (no Range needed) to a local cache file and then play it from
//! disk, where seeking works natively and mpv can read the tail `moov`. This
//! module owns that download + a small amount of progress state the player UI
//! polls while caching. Cache files live in a dedicated directory and are
//! deleted when playback ends or a new prefetch starts.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use futures::StreamExt;
use parking_lot::Mutex;
use reqwest::header::{HeaderName, HeaderValue, ACCEPT_ENCODING, USER_AGENT};
use reqwest::{Client, Url};
use serde::Serialize;
use tokio::io::AsyncWriteExt;
use tokio::task::JoinHandle;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PrefetchState {
    /// A prefetch is currently downloading or has a finished result available.
    pub active: bool,
    pub item_id: Option<String>,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    /// The local cache file is fully written and ready to be played.
    pub ready: bool,
    pub local_path: Option<String>,
    pub error: Option<String>,
}

#[derive(Default)]
struct Progress {
    downloaded: u64,
    total: Option<u64>,
    ready: bool,
    error: Option<String>,
    local_path: Option<String>,
}

struct Job {
    item_id: String,
    handle: JoinHandle<()>,
    path: PathBuf,
    progress: Arc<Mutex<Progress>>,
}

#[derive(Clone)]
pub struct PrefetchManager {
    client: Client,
    cache_dir: PathBuf,
    job: Arc<Mutex<Option<Job>>>,
}

impl PrefetchManager {
    pub fn new() -> AppResult<Self> {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(15))
            .pool_max_idle_per_host(4)
            .no_gzip()
            .no_brotli()
            .build()?;
        let cache_dir = std::env::temp_dir().join("hills-lite-stream-cache");
        Ok(Self {
            client,
            cache_dir,
            job: Arc::new(Mutex::new(None)),
        })
    }

    pub fn snapshot(&self) -> PrefetchState {
        let guard = self.job.lock();
        match guard.as_ref() {
            None => PrefetchState::default(),
            Some(job) => {
                let p = job.progress.lock();
                PrefetchState {
                    active: true,
                    item_id: Some(job.item_id.clone()),
                    downloaded_bytes: p.downloaded,
                    total_bytes: p.total,
                    ready: p.ready,
                    local_path: p.local_path.clone(),
                    error: p.error.clone(),
                }
            }
        }
    }

    /// Cancel any running prefetch and delete its partial/finished cache file.
    pub fn cancel(&self) {
        let job = self.job.lock().take();
        if let Some(job) = job {
            job.handle.abort();
            let _ = std::fs::remove_file(&job.path);
        }
        // Best-effort sweep of any other stale cache files.
        self.sweep_cache_dir();
    }

    fn sweep_cache_dir(&self) {
        let Ok(entries) = std::fs::read_dir(&self.cache_dir) else {
            return;
        };
        for entry in entries.flatten() {
            let _ = std::fs::remove_file(entry.path());
        }
    }

    /// Start downloading a Range-broken source to the local cache. Any previous
    /// prefetch is cancelled and its file removed first.
    pub fn start(
        &self,
        item_id: &str,
        url: Url,
        headers: Vec<(String, String)>,
        user_agent: Option<String>,
        extension: &str,
    ) -> AppResult<()> {
        self.cancel();
        std::fs::create_dir_all(&self.cache_dir)
            .map_err(|e| AppError::InvalidState(format!("create stream cache dir: {e}")))?;
        let ext = sanitize_extension(extension);
        let path = self
            .cache_dir
            .join(format!("{}.{}", Uuid::new_v4().simple(), ext));

        let progress = Arc::new(Mutex::new(Progress::default()));
        let task_progress = progress.clone();
        let client = self.client.clone();
        let task_path = path.clone();
        let handle = tokio::spawn(async move {
            if let Err(error) =
                run_download(client, url, headers, user_agent, &task_path, &task_progress).await
            {
                task_progress.lock().error = Some(redact(&error.to_string()));
            }
        });

        *self.job.lock() = Some(Job {
            item_id: item_id.to_string(),
            handle,
            path,
            progress,
        });
        Ok(())
    }
}

async fn run_download(
    client: Client,
    url: Url,
    headers: Vec<(String, String)>,
    user_agent: Option<String>,
    path: &Path,
    progress: &Arc<Mutex<Progress>>,
) -> AppResult<()> {
    let mut request = client.get(url).header(ACCEPT_ENCODING, "identity");
    if let Some(ua) = user_agent.as_deref().filter(|ua| !ua.trim().is_empty()) {
        request = request.header(USER_AGENT, ua);
    }
    for (name, value) in &headers {
        if name.eq_ignore_ascii_case("host") {
            continue;
        }
        let Ok(header_name) = HeaderName::from_bytes(name.as_bytes()) else {
            continue;
        };
        let Ok(header_value) = HeaderValue::from_str(value) else {
            continue;
        };
        request = request.header(header_name, header_value);
    }

    let response = request.send().await?.error_for_status()?;
    progress.lock().total = response.content_length();

    let mut file = tokio::fs::File::create(path)
        .await
        .map_err(|e| AppError::InvalidState(format!("create cache file: {e}")))?;
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk)
            .await
            .map_err(|e| AppError::InvalidState(format!("write cache file: {e}")))?;
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        progress.lock().downloaded = downloaded;
    }
    file.flush()
        .await
        .map_err(|e| AppError::InvalidState(format!("flush cache file: {e}")))?;

    let mut guard = progress.lock();
    guard.downloaded = downloaded;
    guard.local_path = Some(path.to_string_lossy().to_string());
    guard.ready = true;
    Ok(())
}

fn sanitize_extension(extension: &str) -> String {
    let ext = extension
        .split(',')
        .next()
        .unwrap_or_default()
        .trim()
        .trim_start_matches('.')
        .to_ascii_lowercase();
    if ext.is_empty() || ext.len() > 16 || !ext.chars().all(|c| c.is_ascii_alphanumeric()) {
        return "mp4".into();
    }
    ext
}

fn redact(input: &str) -> String {
    let mut text = input.replace(['\r', '\n'], " ");
    if text.len() > 200 {
        text.truncate(200);
        text.push_str("...");
    }
    text
}
