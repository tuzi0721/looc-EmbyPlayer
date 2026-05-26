use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use crate::danmaku::{by_id, registry, DanmakuResult};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub id: &'static str,
    pub display_name: &'static str,
}

#[tauri::command]
pub async fn list_danmaku_providers() -> AppResult<Vec<ProviderInfo>> {
    Ok(registry()
        .into_iter()
        .map(|p| ProviderInfo {
            id: p.id(),
            display_name: p.display_name(),
        })
        .collect())
}

#[tauri::command]
pub async fn fetch_danmaku(
    state: State<'_, Arc<AppState>>,
    item_id: String,
    provider: Option<String>,
) -> AppResult<Option<DanmakuResult>> {
    let provider_id = provider.unwrap_or_else(|| "dandanplay".into());
    let provider = by_id(&provider_id)
        .ok_or_else(|| AppError::NotFound(format!("danmaku provider {provider_id}")))?;

    let account = state
        .config
        .active_account()
        .ok_or_else(|| AppError::InvalidState("no active account".into()))?;
    let server = state
        .config
        .server(&account.server_id)
        .ok_or_else(|| AppError::NotFound(account.server_id.clone()))?;
    let item = state.emby.get_item(&server, &account, &item_id).await?;

    let client = state.emby.http().clone();
    let Some(ep_id) = provider.match_item(&client, &item).await? else {
        return Ok(None);
    };
    let result = provider.fetch(&client, &ep_id).await?;
    Ok(Some(result))
}
