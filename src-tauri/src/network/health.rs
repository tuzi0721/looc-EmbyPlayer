use std::time::Instant;

use chrono::Utc;
use futures::future::join_all;
use reqwest::Client;
use serde::Serialize;
use url::Url;

use crate::config::models::{Line, LineStatus};
use crate::network::http::RequestContext;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LineHealthReport {
    pub line_id: String,
    pub status: LineStatus,
    pub latency_ms: Option<u32>,
    pub http_status: Option<u16>,
    pub error: Option<String>,
}

const HEALTH_PATH: &str = "/System/Info/Public";

pub struct HealthChecker {
    client: Client,
}

impl HealthChecker {
    pub fn new(client: Client) -> Self {
        Self { client }
    }

    /// Check a single line. Uses Emby/Jellyfin `/System/Info/Public` which is unauthenticated.
    pub async fn check_one(&self, line: &Line, default_ua: &str) -> LineHealthReport {
        let ua = line.user_agent.clone().unwrap_or_else(|| default_ua.to_string());
        let ctx = RequestContext {
            line: line.clone(),
            effective_ua: ua,
            extra_headers: line.headers.clone(),
        };

        let url = match Url::parse(&line.base_url).and_then(|u| u.join(HEALTH_PATH)) {
            Ok(u) => u,
            Err(e) => {
                return LineHealthReport {
                    line_id: line.id.clone(),
                    status: LineStatus::Down,
                    latency_ms: None,
                    http_status: None,
                    error: Some(format!("bad url: {e}")),
                }
            }
        };

        let headers = match ctx.header_map() {
            Ok(h) => h,
            Err(e) => {
                return LineHealthReport {
                    line_id: line.id.clone(),
                    status: LineStatus::Down,
                    latency_ms: None,
                    http_status: None,
                    error: Some(e.to_string()),
                }
            }
        };

        let started = Instant::now();
        let result = self
            .client
            .get(url)
            .headers(headers)
            .send()
            .await;

        let latency = started.elapsed().as_millis() as u32;

        match result {
            Ok(resp) => {
                let code = resp.status().as_u16();
                let ok = resp.status().is_success();
                let status = if !ok {
                    LineStatus::Degraded
                } else if latency < 250 {
                    LineStatus::Healthy
                } else if latency < 800 {
                    LineStatus::Slow
                } else {
                    LineStatus::Degraded
                };
                LineHealthReport {
                    line_id: line.id.clone(),
                    status,
                    latency_ms: Some(latency),
                    http_status: Some(code),
                    error: None,
                }
            }
            Err(e) => LineHealthReport {
                line_id: line.id.clone(),
                status: LineStatus::Down,
                latency_ms: None,
                http_status: None,
                error: Some(e.to_string()),
            },
        }
    }

    pub async fn check_all(&self, lines: &[Line], default_ua: &str) -> Vec<LineHealthReport> {
        let futs = lines
            .iter()
            .filter(|l| l.enabled)
            .map(|l| self.check_one(l, default_ua));
        join_all(futs).await
    }
}

pub fn apply_report_to_line(line: &mut Line, report: &LineHealthReport) {
    line.last_latency_ms = report.latency_ms;
    line.last_status = Some(report.status);
    line.last_checked_at = Some(Utc::now());
}
