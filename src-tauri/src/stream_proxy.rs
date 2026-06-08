use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

use dashmap::DashMap;
use futures::StreamExt;
use reqwest::{
    header::{
        HeaderName, HeaderValue, ACCEPT_ENCODING, ACCEPT_RANGES, AUTHORIZATION, CONTENT_LENGTH,
        CONTENT_RANGE, CONTENT_TYPE, RANGE, USER_AGENT,
    },
    Client, Method, StatusCode, Url,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

const MAX_HEADER_BYTES: usize = 16 * 1024;
const MAX_MP4_PREFIX_PROBE_BYTES: usize = 2 * 1024 * 1024;
const ROUTE_TTL: Duration = Duration::from_secs(3 * 60 * 60);

#[derive(Clone)]
pub struct StreamProxy {
    inner: Arc<StreamProxyInner>,
}

struct StreamProxyInner {
    client: Client,
    routes: DashMap<String, ProxyRoute>,
    listener_started: AtomicBool,
    addr: parking_lot::Mutex<Option<SocketAddr>>,
}

#[derive(Clone)]
struct ProxyRoute {
    url: Url,
    headers: Vec<(String, String)>,
    user_agent: Option<String>,
    range_supported: bool,
    expires_at: Instant,
}

impl StreamProxy {
    pub fn new() -> AppResult<Self> {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .pool_max_idle_per_host(8)
            .no_gzip()
            .no_brotli()
            .build()?;
        Ok(Self {
            inner: Arc::new(StreamProxyInner {
                client,
                routes: DashMap::new(),
                listener_started: AtomicBool::new(false),
                addr: parking_lot::Mutex::new(None),
            }),
        })
    }

    pub async fn register(
        &self,
        url: Url,
        headers: Vec<(String, String)>,
        user_agent: Option<String>,
    ) -> AppResult<String> {
        self.register_with_range_support(url, headers, user_agent, true)
            .await
    }

    pub async fn register_with_range_support(
        &self,
        url: Url,
        headers: Vec<(String, String)>,
        user_agent: Option<String>,
        range_supported: bool,
    ) -> AppResult<String> {
        let addr = self.ensure_started().await?;
        self.prune_expired();
        let id = Uuid::new_v4().simple().to_string();
        self.inner.routes.insert(
            id.clone(),
            ProxyRoute {
                url,
                headers,
                user_agent,
                range_supported,
                expires_at: Instant::now() + ROUTE_TTL,
            },
        );
        Ok(format!("http://{addr}/stream/{id}"))
    }

    /// Probe a candidate stream URL. Returns the upstream HTTP status and
    /// whether real HTTP Range is supported (`206` + `Content-Range`). The
    /// status lets the caller skip `404`/error candidates (e.g. a wrong path
    /// prefix) instead of treating them as a non-seekable stream.
    pub async fn probe_range_support(
        &self,
        url: Url,
        headers: Vec<(String, String)>,
        user_agent: Option<String>,
    ) -> AppResult<(u16, bool)> {
        let mut upstream = self.inner.client.get(url);
        // Use an open-ended `bytes=0-` like browsers / official players do.
        // A degenerate `bytes=0-0` makes some origins/CDNs (e.g. Cloudflare in
        // front of Emby) answer `200` without `Content-Range`, which we would
        // misread as "Range unsupported" and needlessly fall back to caching.
        upstream = upstream
            .header(ACCEPT_ENCODING, "identity")
            .header(RANGE, "bytes=0-");
        if let Some(ua) = user_agent.as_deref().filter(|ua| !ua.trim().is_empty()) {
            upstream = upstream.header(USER_AGENT, ua);
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
            upstream = upstream.header(header_name, header_value);
        }

        let response = upstream.send().await?;
        let status = response.status();
        let has_content_range = response.headers().get(CONTENT_RANGE).is_some();
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(sanitize_proxy_log_value)
            .unwrap_or_else(|| "none".into());
        let supported = status == StatusCode::PARTIAL_CONTENT && has_content_range;
        log_visual_stream_proxy_event(&format!(
            "range-probe status={} content_range={} content_type={} supported={}",
            status.as_u16(),
            has_content_range,
            content_type,
            supported
        ));
        // Always-on evidence (not just during visual-smoke runs) so line
        // selection / Range failover can be diagnosed from normal logs.
        tracing::info!(
            target = "stream-proxy",
            status = status.as_u16(),
            has_content_range,
            content_type = %content_type,
            supported,
            "range preflight"
        );
        Ok((status.as_u16(), supported))
    }

    pub async fn probe_mp4_streamable_prefix(
        &self,
        url: Url,
        headers: Vec<(String, String)>,
        user_agent: Option<String>,
    ) -> AppResult<bool> {
        let mut upstream = self.inner.client.get(url);
        upstream = upstream.header(ACCEPT_ENCODING, "identity");
        if let Some(ua) = user_agent.as_deref().filter(|ua| !ua.trim().is_empty()) {
            upstream = upstream.header(USER_AGENT, ua);
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
            upstream = upstream.header(header_name, header_value);
        }

        let response = upstream.send().await?;
        let status = response.status();
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(sanitize_proxy_log_value)
            .unwrap_or_else(|| "none".into());
        let mut body = response.bytes_stream();
        let mut prefix = Vec::with_capacity(64 * 1024);
        while prefix.len() < MAX_MP4_PREFIX_PROBE_BYTES {
            let Some(chunk) = body.next().await else {
                break;
            };
            let chunk = chunk?;
            let remaining = MAX_MP4_PREFIX_PROBE_BYTES.saturating_sub(prefix.len());
            prefix.extend_from_slice(&chunk[..chunk.len().min(remaining)]);
        }
        let has_moov = prefix.windows(4).any(|window| window == b"moov");
        let has_moof = prefix.windows(4).any(|window| window == b"moof");
        let has_mdat = prefix.windows(4).any(|window| window == b"mdat");
        let streamable = has_moov || has_moof;
        log_visual_stream_proxy_event(&format!(
            "mp4-prefix-probe status={} content_type={} bytes={} moov={} moof={} mdat={} streamable={}",
            status.as_u16(),
            content_type,
            prefix.len(),
            has_moov,
            has_moof,
            has_mdat,
            streamable
        ));
        Ok(streamable)
    }

    pub fn clear(&self) {
        self.inner.routes.clear();
    }

    fn prune_expired(&self) {
        let now = Instant::now();
        self.inner.routes.retain(|_, route| route.expires_at > now);
    }

    async fn ensure_started(&self) -> AppResult<SocketAddr> {
        if let Some(addr) = *self.inner.addr.lock() {
            return Ok(addr);
        }

        if self
            .inner
            .listener_started
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
        {
            let listener = TcpListener::bind(("127.0.0.1", 0)).await?;
            let addr = listener.local_addr()?;
            *self.inner.addr.lock() = Some(addr);
            let inner = self.inner.clone();
            tokio::spawn(async move {
                accept_loop(inner, listener).await;
            });
            return Ok(addr);
        }

        let started = Instant::now();
        loop {
            if let Some(addr) = *self.inner.addr.lock() {
                return Ok(addr);
            }
            if started.elapsed() > Duration::from_secs(2) {
                return Err(AppError::InvalidState(
                    "stream proxy did not become ready".into(),
                ));
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    }
}

async fn accept_loop(inner: Arc<StreamProxyInner>, listener: TcpListener) {
    loop {
        match listener.accept().await {
            Ok((stream, _)) => {
                let inner = inner.clone();
                tokio::spawn(async move {
                    if let Err(error) = handle_connection(inner, stream).await {
                        tracing::debug!(target = "stream-proxy", error = %error, "proxy request ended");
                    }
                });
            }
            Err(error) => {
                tracing::warn!(target = "stream-proxy", error = %error, "proxy accept failed");
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        }
    }
}

async fn handle_connection(inner: Arc<StreamProxyInner>, mut stream: TcpStream) -> AppResult<()> {
    let request = match read_request(&mut stream).await {
        Ok(request) => request,
        Err(error) => {
            let _ = write_simple_response(
                &mut stream,
                StatusCode::BAD_REQUEST,
                "bad request",
                error.to_string().as_bytes(),
            )
            .await;
            return Err(error);
        }
    };

    if request.method != "GET" && request.method != "HEAD" {
        write_simple_response(
            &mut stream,
            StatusCode::METHOD_NOT_ALLOWED,
            "method not allowed",
            b"",
        )
        .await?;
        return Ok(());
    }

    let Some(id) = request.path.strip_prefix("/stream/") else {
        write_simple_response(&mut stream, StatusCode::NOT_FOUND, "not found", b"").await?;
        return Ok(());
    };
    let id = id.split('?').next().unwrap_or(id);
    let Some(route) = inner.routes.get(id).map(|route| route.clone()) else {
        write_simple_response(&mut stream, StatusCode::NOT_FOUND, "not found", b"").await?;
        return Ok(());
    };
    if route.expires_at <= Instant::now() {
        inner.routes.remove(id);
        write_simple_response(&mut stream, StatusCode::NOT_FOUND, "not found", b"").await?;
        return Ok(());
    }

    let mut upstream = inner.client.request(Method::GET, route.url.clone());
    upstream = upstream.header(ACCEPT_ENCODING, "identity");
    if let Some(ua) = route
        .user_agent
        .as_deref()
        .filter(|ua| !ua.trim().is_empty())
    {
        upstream = upstream.header(USER_AGENT, ua);
    }
    for (name, value) in &route.headers {
        if name.eq_ignore_ascii_case("host") {
            continue;
        }
        let Ok(header_name) = HeaderName::from_bytes(name.as_bytes()) else {
            continue;
        };
        let Ok(header_value) = HeaderValue::from_str(value) else {
            continue;
        };
        upstream = upstream.header(header_name, header_value);
    }
    let requested_range = request.headers.get("range").cloned();
    if route.range_supported {
        if let Some(range) = requested_range.as_deref() {
            upstream = upstream.header(RANGE, range);
        }
    } else if let Some(range) = requested_range.as_deref() {
        log_visual_stream_proxy_event(&format!(
            "range-suppressed id={} range={}",
            short_route_id(id),
            sanitize_proxy_log_value(range)
        ));
    }

    let range_value = requested_range
        .as_deref()
        .map(sanitize_proxy_log_value)
        .unwrap_or_else(|| "none".into());
    let response = match upstream.send().await {
        Ok(response) => response,
        Err(error) => {
            log_visual_stream_proxy_event(&format!(
                "request id={} method={} range={} range_supported={} upstream_error={}",
                short_route_id(id),
                request.method,
                range_value,
                route.range_supported,
                sanitize_proxy_log_value(&error.to_string())
            ));
            tracing::warn!(
                target = "stream-proxy",
                id = %short_route_id(id),
                method = %request.method,
                range = %range_value,
                range_supported = route.range_supported,
                error = %sanitize_proxy_log_value(&error.to_string()),
                "upstream stream request failed"
            );
            write_simple_response(
                &mut stream,
                StatusCode::BAD_GATEWAY,
                "bad gateway",
                b"upstream failed",
            )
            .await?;
            return Err(AppError::Network(error));
        }
    };
    let status = response.status();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(sanitize_proxy_log_value)
        .unwrap_or_else(|| "none".into());
    let content_length = response
        .headers()
        .get(CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .map(sanitize_proxy_log_value)
        .unwrap_or_else(|| "unknown".into());
    log_visual_stream_proxy_event(&format!(
        "request id={} method={} range={} range_supported={} upstream_status={} content_type={} content_length={}",
        short_route_id(id),
        request.method,
        range_value,
        route.range_supported,
        status.as_u16(),
        content_type,
        content_length
    ));
    if status.as_u16() >= 400 {
        tracing::warn!(
            target = "stream-proxy",
            id = %short_route_id(id),
            range = %range_value,
            range_supported = route.range_supported,
            status = status.as_u16(),
            "upstream returned error status for stream request"
        );
    }

    let bytes = write_upstream_response(
        &mut stream,
        response,
        request.method == "HEAD",
        route.range_supported,
    )
    .await?;
    log_visual_stream_proxy_event(&format!(
        "complete id={} method={} range={} range_supported={} status={} bytes={}",
        short_route_id(id),
        request.method,
        range_value,
        route.range_supported,
        status.as_u16(),
        bytes
    ));
    Ok(())
}

#[derive(Debug)]
struct ProxyRequest {
    method: String,
    path: String,
    headers: HashMap<String, String>,
}

async fn read_request(stream: &mut TcpStream) -> AppResult<ProxyRequest> {
    let mut buf = Vec::with_capacity(1024);
    let mut chunk = [0_u8; 512];
    loop {
        let n = stream.read(&mut chunk).await?;
        if n == 0 {
            return Err(AppError::InvalidState("empty proxy request".into()));
        }
        buf.extend_from_slice(&chunk[..n]);
        if buf.windows(4).any(|w| w == b"\r\n\r\n") {
            break;
        }
        if buf.len() > MAX_HEADER_BYTES {
            return Err(AppError::InvalidState("proxy request too large".into()));
        }
    }

    let text = String::from_utf8_lossy(&buf);
    let mut lines = text.split("\r\n");
    let first = lines
        .next()
        .ok_or_else(|| AppError::InvalidState("missing request line".into()))?;
    let mut parts = first.split_whitespace();
    let method = parts
        .next()
        .ok_or_else(|| AppError::InvalidState("missing request method".into()))?
        .to_string();
    let path = parts
        .next()
        .ok_or_else(|| AppError::InvalidState("missing request path".into()))?
        .to_string();
    let mut headers = HashMap::new();
    for line in lines {
        if line.is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }
    Ok(ProxyRequest {
        method,
        path,
        headers,
    })
}

async fn write_upstream_response(
    stream: &mut TcpStream,
    response: reqwest::Response,
    head_only: bool,
    range_supported: bool,
) -> AppResult<u64> {
    let status = response.status();
    let reason = status.canonical_reason().unwrap_or("ok");
    let mut head = format!("HTTP/1.1 {} {}\r\n", status.as_u16(), reason);
    for name in [
        CONTENT_TYPE,
        CONTENT_LENGTH,
        CONTENT_RANGE,
        ACCEPT_RANGES,
        AUTHORIZATION,
    ] {
        if name == AUTHORIZATION {
            continue;
        }
        if !range_supported && (name == CONTENT_RANGE || name == ACCEPT_RANGES) {
            continue;
        }
        if let Some(value) = response.headers().get(&name) {
            if let Ok(value) = value.to_str() {
                head.push_str(name.as_str());
                head.push_str(": ");
                head.push_str(value);
                head.push_str("\r\n");
            }
        }
    }
    head.push_str("Connection: close\r\n\r\n");
    stream.write_all(head.as_bytes()).await?;
    if head_only {
        stream.shutdown().await?;
        return Ok(0);
    }

    let mut body = response.bytes_stream();
    let mut sent = 0_u64;
    while let Some(chunk) = body.next().await {
        let chunk = chunk?;
        sent = sent.saturating_add(chunk.len() as u64);
        if stream.write_all(&chunk).await.is_err() {
            break;
        }
    }
    let _ = stream.shutdown().await;
    Ok(sent)
}

async fn write_simple_response(
    stream: &mut TcpStream,
    status: StatusCode,
    reason: &str,
    body: &[u8],
) -> AppResult<()> {
    let head = format!(
        "HTTP/1.1 {} {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        status.as_u16(),
        reason,
        body.len()
    );
    stream.write_all(head.as_bytes()).await?;
    stream.write_all(body).await?;
    let _ = stream.shutdown().await;
    Ok(())
}

fn short_route_id(id: &str) -> String {
    id.chars().take(8).collect()
}

fn sanitize_proxy_log_value(input: &str) -> String {
    let mut text = input.replace(['\r', '\n'], " ");
    if text.len() > 120 {
        text.truncate(120);
        text.push_str("...");
    }
    text
}

fn log_visual_stream_proxy_event(msg: &str) {
    if std::env::var_os("HILLS_TAURI_CDP_PORT").is_none() {
        return;
    }
    let path = std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .or_else(|| {
            std::env::var_os("USERPROFILE")
                .map(std::path::PathBuf::from)
                .map(|p| p.join("AppData").join("Local"))
        })
        .unwrap_or_else(std::env::temp_dir);
    let dir = path.join("EmbyPlayer");
    let _ = std::fs::create_dir_all(&dir);
    let file = dir.join("visual-smoke.log");
    let when = chrono::Utc::now().to_rfc3339();
    let line = format!("{when} player stream-proxy:{msg}\n");
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file)
        .and_then(|mut f| std::io::Write::write_all(&mut f, line.as_bytes()));
}
