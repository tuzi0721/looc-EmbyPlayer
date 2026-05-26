use std::sync::Arc;

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
    pub lines: Vec<LineInput>,
    pub default_user_agent: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineInput {
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
    pub default_user_agent: Option<String>,
    pub auto_failover: Option<bool>,
    pub lines: Option<Vec<LineInput>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestLinesResponse {
    pub server_id: String,
    pub reports: Vec<LineHealthReport>,
}

#[tauri::command]
pub async fn list_servers(state: State<'_, Arc<AppState>>) -> AppResult<Vec<Server>> {
    Ok(state.config.servers())
}

#[tauri::command]
pub async fn add_server(
    state: State<'_, Arc<AppState>>,
    payload: AddServerPayload,
) -> AppResult<Server> {
    let lines = payload
        .lines
        .into_iter()
        .map(|l| {
            let mut line = Line::new(l.name, l.base_url);
            line.user_agent = l.user_agent;
            line.headers = l.headers;
            line.priority = l.priority;
            line.enabled = l.enabled;
            line
        })
        .collect::<Vec<_>>();
    if lines.is_empty() {
        return Err(AppError::InvalidState("server requires at least one line".into()));
    }
    let mut server = Server::new(payload.name, payload.kind, lines);
    server.default_user_agent = payload.default_user_agent;
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
    if payload.default_user_agent.is_some() {
        server.default_user_agent = payload.default_user_agent;
    }
    if let Some(af) = payload.auto_failover {
        server.auto_failover = af;
    }
    if let Some(lines_in) = payload.lines {
        let lines = lines_in
            .into_iter()
            .map(|l| {
                let existing = server
                    .lines
                    .iter()
                    .find(|x| x.base_url == l.base_url)
                    .cloned();
                let mut line = existing.unwrap_or_else(|| Line::new(l.name.clone(), l.base_url.clone()));
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
                server.active_line_id = server.lines.iter().find(|l| l.enabled).map(|l| l.id.clone());
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

    Ok(TestLinesResponse {
        server_id,
        reports,
    })
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
