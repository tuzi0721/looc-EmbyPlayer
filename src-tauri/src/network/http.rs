use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderName, HeaderValue, USER_AGENT};
use reqwest::Client;

use crate::config::models::Line;
use crate::error::{AppError, AppResult};

/// Per-request context: chosen line + the effective user agent and extra headers.
#[derive(Debug, Clone)]
pub struct RequestContext {
    pub line: Line,
    pub effective_ua: String,
    pub extra_headers: Vec<(String, String)>,
}

impl RequestContext {
    pub fn header_map(&self) -> AppResult<HeaderMap> {
        let mut map = HeaderMap::new();
        map.insert(
            USER_AGENT,
            HeaderValue::from_str(&self.effective_ua)
                .map_err(|e| AppError::Other(format!("bad UA: {e}")))?,
        );
        for (k, v) in &self.extra_headers {
            let name = HeaderName::from_bytes(k.as_bytes())
                .map_err(|e| AppError::Other(format!("bad header name '{k}': {e}")))?;
            let val = HeaderValue::from_str(v)
                .map_err(|e| AppError::Other(format!("bad header value for '{k}': {e}")))?;
            map.insert(name, val);
        }
        Ok(map)
    }
}

pub fn build_client(timeout_ms: u64) -> AppResult<Client> {
    Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .connect_timeout(Duration::from_millis(timeout_ms.min(5_000)))
        .pool_max_idle_per_host(8)
        .gzip(true)
        .brotli(true)
        .build()
        .map_err(AppError::from)
}
