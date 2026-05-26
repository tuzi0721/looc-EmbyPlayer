use std::sync::Arc;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::config::models::Account;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginPayload {
    pub server_id: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResult {
    pub account: Account,
    pub winning_line_id: String,
}

#[tauri::command]
pub async fn login(
    state: State<'_, Arc<AppState>>,
    payload: LoginPayload,
) -> AppResult<LoginResult> {
    let server = state
        .config
        .server(&payload.server_id)
        .ok_or_else(|| AppError::NotFound(format!("server {}", payload.server_id)))?;
    let (auth, winning_line) = state
        .emby
        .authenticate(&server, &payload.username, &payload.password)
        .await?;

    let account = Account {
        id: Uuid::new_v4().to_string(),
        server_id: server.id.clone(),
        user_id: auth.user.id,
        username: auth.user.name,
        access_token: auth.access_token,
        avatar_tag: auth.user.primary_image_tag,
        created_at: Utc::now(),
        last_used_at: Utc::now(),
    };
    state.config.upsert_account(account.clone())?;
    state.config.set_active_account(Some(account.id.clone()))?;

    let mut updated = server.clone();
    updated.active_line_id = Some(winning_line.id.clone());
    state.config.upsert_server(updated)?;

    let _ = state.inner().restart_socket().await;

    Ok(LoginResult {
        account,
        winning_line_id: winning_line.id,
    })
}

#[tauri::command]
pub async fn logout(state: State<'_, Arc<AppState>>, account_id: String) -> AppResult<()> {
    state.config.remove_account(&account_id)
}

#[tauri::command]
pub async fn list_accounts(state: State<'_, Arc<AppState>>) -> AppResult<Vec<Account>> {
    Ok(state.config.accounts())
}

#[tauri::command]
pub async fn switch_account(
    state: State<'_, Arc<AppState>>,
    account_id: String,
) -> AppResult<Account> {
    let account = state
        .config
        .account(&account_id)
        .ok_or_else(|| AppError::NotFound(format!("account {account_id}")))?;
    state.config.set_active_account(Some(account.id.clone()))?;
    let _ = state.inner().restart_socket().await;
    Ok(account)
}
