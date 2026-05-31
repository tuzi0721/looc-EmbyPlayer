use std::sync::Arc;
use std::time::Instant;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::config::models::{Line, Server, ServerKind};
use crate::error::{AppError, AppResult};
use crate::network::health::apply_report_to_line;
use crate::network::LineHealthReport;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddServerPayload {
    pub name: String,
    pub kind: ServerKind,
    pub active_line_id: Option<String>,
    pub lines: Vec<LineInput>,
    pub default_user_agent: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineInput {
    pub id: Option<String>,
    pub name: String,
    pub base_url: String,
    pub user_agent: Option<String>,
    #[serde(default)]
    pub headers: Vec<(String, String)>,
    #[serde(default)]
    pub priority: i32,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateServerPayload {
    pub id: String,
    pub name: Option<String>,
    pub kind: Option<ServerKind>,
    #[serde(default)]
    pub default_user_agent: Option<Option<String>>,
    pub auto_failover: Option<bool>,
    pub lines: Option<Vec<LineInput>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestLinesResponse {
    pub server_id: String,
    pub reports: Vec<LineHealthReport>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectServerPayload {
    pub lines: Vec<LineInput>,
    pub default_user_agent: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectServerLineReport {
    pub line_id: String,
    pub line_name: String,
    pub status: String,
    pub kind: Option<ServerKind>,
    pub server_name: Option<String>,
    pub version: Option<String>,
    pub product_name: Option<String>,
    pub latency_ms: Option<u32>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectServerResponse {
    pub kind: ServerKind,
    pub winning_line_id: String,
    pub server_name: Option<String>,
    pub version: Option<String>,
    pub product_name: Option<String>,
    pub reports: Vec<DetectServerLineReport>,
}

#[tauri::command]
pub async fn list_servers(state: State<'_, Arc<AppState>>) -> AppResult<Vec<Server>> {
    Ok(state.config.servers())
}

fn line_from_input(l: LineInput) -> Line {
    let mut line = Line::new(l.name, l.base_url);
    if let Some(id) = l.id {
        line.id = id;
    }
    line.user_agent = l.user_agent;
    line.headers = l.headers;
    line.priority = l.priority;
    line.enabled = l.enabled;
    line
}

fn optional_text(value: String) -> Option<String> {
    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

fn detect_kind(product_name: &Option<String>, server_name: &Option<String>) -> ServerKind {
    let product = product_name
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let name = server_name
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase();
    if product.contains("jellyfin") || name.contains("jellyfin") {
        ServerKind::Jellyfin
    } else {
        ServerKind::Emby
    }
}

#[tauri::command]
pub async fn detect_server(
    state: State<'_, Arc<AppState>>,
    payload: DetectServerPayload,
) -> AppResult<DetectServerResponse> {
    let mut lines = payload
        .lines
        .into_iter()
        .map(line_from_input)
        .filter(|line| line.enabled)
        .collect::<Vec<_>>();
    if lines.is_empty() {
        return Err(AppError::InvalidState("no available line".into()));
    }
    lines.sort_by_key(|line| line.priority);

    let settings = state.config.settings();
    let default_ua = payload
        .default_user_agent
        .unwrap_or(settings.default_user_agent);
    let mut reports = Vec::new();

    for line in lines {
        let started = Instant::now();
        match state.emby.system_info_public(&line, &default_ua).await {
            Ok(info) => {
                let server_name = optional_text(info.server_name);
                let version = optional_text(info.version);
                let product_name = info.product_name;
                let kind = detect_kind(&product_name, &server_name);
                reports.push(DetectServerLineReport {
                    line_id: line.id.clone(),
                    line_name: line.name.clone(),
                    status: "healthy".into(),
                    kind: Some(kind),
                    server_name: server_name.clone(),
                    version: version.clone(),
                    product_name: product_name.clone(),
                    latency_ms: Some(started.elapsed().as_millis().min(u128::from(u32::MAX)) as u32),
                    error: None,
                });
                return Ok(DetectServerResponse {
                    kind,
                    winning_line_id: line.id,
                    server_name,
                    version,
                    product_name,
                    reports,
                });
            }
            Err(error) => reports.push(DetectServerLineReport {
                line_id: line.id,
                line_name: line.name,
                status: "down".into(),
                kind: None,
                server_name: None,
                version: None,
                product_name: None,
                latency_ms: None,
                error: Some(error.to_string()),
            }),
        }
    }

    Err(AppError::Other(
        reports
            .iter()
            .map(|report| {
                format!(
                    "{}: {}",
                    report.line_name,
                    report.error.as_deref().unwrap_or("detect failed")
                )
            })
            .collect::<Vec<_>>()
            .join("; "),
    ))
}

#[tauri::command]
pub async fn add_server(
    state: State<'_, Arc<AppState>>,
    payload: AddServerPayload,
) -> AppResult<Server> {
    let lines = payload
        .lines
        .into_iter()
        .map(line_from_input)
        .collect::<Vec<_>>();
    if lines.is_empty() {
        return Err(AppError::InvalidState(
            "server requires at least one line".into(),
        ));
    }
    let mut server = Server::new(payload.name, payload.kind, lines);
    server.default_user_agent = payload.default_user_agent;
    if let Some(active) = payload.active_line_id {
        if server
            .lines
            .iter()
            .any(|line| line.id == active && line.enabled)
        {
            server.active_line_id = Some(active);
        }
    }
    state.config.upsert_server(server.clone())?;
    Ok(server)
}

#[tauri::command]
pub async fn update_server(
    state: State<'_, Arc<AppState>>,
    payload: UpdateServerPayload,
) -> AppResult<Server> {
    let mut server = state
        .config
        .server(&payload.id)
        .ok_or_else(|| AppError::NotFound(payload.id.clone()))?;
    if let Some(n) = payload.name {
        server.name = n;
    }
    if let Some(k) = payload.kind {
        server.kind = k;
    }
    if let Some(default_user_agent) = payload.default_user_agent {
        server.default_user_agent = default_user_agent;
    }
    if let Some(af) = payload.auto_failover {
        server.auto_failover = af;
    }
    if let Some(lines_in) = payload.lines {
        let lines = lines_in
            .into_iter()
            .map(|l| {
                let existing =
                    l.id.as_ref()
                        .and_then(|id| server.lines.iter().find(|x| &x.id == id).cloned())
                        .or_else(|| {
                            server
                                .lines
                                .iter()
                                .find(|x| x.base_url == l.base_url)
                                .cloned()
                        });
                let mut line =
                    existing.unwrap_or_else(|| Line::new(l.name.clone(), l.base_url.clone()));
                if let Some(id) = l.id {
                    line.id = id;
                }
                line.name = l.name;
                line.base_url = l.base_url;
                line.user_agent = l.user_agent;
                line.headers = l.headers;
                line.priority = l.priority;
                line.enabled = l.enabled;
                line
            })
            .collect::<Vec<_>>();
        server.lines = lines;
        if let Some(active) = &server.active_line_id {
            if !server.lines.iter().any(|l| &l.id == active && l.enabled) {
                server.active_line_id = server
                    .lines
                    .iter()
                    .find(|l| l.enabled)
                    .map(|l| l.id.clone());
            }
        }
    }
    state.config.upsert_server(server.clone())?;
    Ok(server)
}

#[tauri::command]
pub async fn remove_server(state: State<'_, Arc<AppState>>, id: String) -> AppResult<()> {
    state.config.remove_server(&id)
}

#[tauri::command]
pub async fn test_lines(
    state: State<'_, Arc<AppState>>,
    server_id: String,
) -> AppResult<TestLinesResponse> {
    let mut server = state
        .config
        .server(&server_id)
        .ok_or_else(|| AppError::NotFound(server_id.clone()))?;

    let settings = state.config.settings();
    let default_ua = server
        .default_user_agent
        .clone()
        .unwrap_or(settings.default_user_agent.clone());
    let checker = state.emby.health_checker();
    let reports = checker.check_all(&server.lines, &default_ua).await;

    for r in &reports {
        if let Some(line) = server.lines.iter_mut().find(|l| l.id == r.line_id) {
            apply_report_to_line(line, r);
        }
    }
    if server.auto_failover {
        if let Some(best) = best_line(&server.lines) {
            server.active_line_id = Some(best);
        }
    }
    state.config.upsert_server(server)?;

    Ok(TestLinesResponse { server_id, reports })
}

fn best_line(lines: &[Line]) -> Option<String> {
    let mut candidates: Vec<&Line> = lines
        .iter()
        .filter(|l| {
            l.enabled
                && l.last_status
                    .map(|s| !matches!(s, crate::config::models::LineStatus::Down))
                    .unwrap_or(true)
        })
        .collect();
    candidates.sort_by_key(|l| (l.priority, l.last_latency_ms.unwrap_or(u32::MAX)));
    candidates.first().map(|l| l.id.clone())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetActiveLinePayload {
    pub server_id: String,
    pub line_id: String,
}

#[tauri::command]
pub async fn set_active_line(
    state: State<'_, Arc<AppState>>,
    payload: SetActiveLinePayload,
) -> AppResult<Server> {
    let mut server = state
        .config
        .server(&payload.server_id)
        .ok_or_else(|| AppError::NotFound(payload.server_id.clone()))?;
    if !server.lines.iter().any(|l| l.id == payload.line_id) {
        return Err(AppError::NotFound(payload.line_id.clone()));
    }
    server.active_line_id = Some(payload.line_id);
    state.config.upsert_server(server.clone())?;
    Ok(server)
}
