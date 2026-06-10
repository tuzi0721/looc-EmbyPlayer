use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderName, HeaderValue, USER_AGENT};
use reqwest::Client;

use crate::config::models::{AppSettings, Line, NetworkProxyMode};
use crate::error::{AppError, AppResult};

/// Per-request context: chosen line + the effective user agent and extra headers.
#[derive(Debug, Clone)]
pub struct RequestContext {
    #[allow(dead_code)]
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

pub fn build_client(settings: &AppSettings) -> AppResult<Client> {
    let timeout_ms = settings.request_timeout_ms;
    let mut builder = Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .connect_timeout(Duration::from_millis(timeout_ms.min(5_000)))
        .pool_max_idle_per_host(8)
        .gzip(true)
        .brotli(true);

    // Reference parity (HillsLite 设置·通用·网络).
    if settings.ignore_ssl_errors {
        builder = builder.danger_accept_invalid_certs(true);
    }
    match settings.network_proxy_mode {
        NetworkProxyMode::None => {
            builder = builder.no_proxy();
        }
        // reqwest's default already honors the environment/system proxy vars.
        NetworkProxyMode::System => {}
        NetworkProxyMode::Custom => {
            let url = settings.http_proxy_url.trim();
            if !url.is_empty() {
                builder = builder.proxy(reqwest::Proxy::all(url).map_err(AppError::from)?);
            }
        }
    }

    builder.build().map_err(AppError::from)
}
