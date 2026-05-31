use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::danmaku::{by_id, registry, xml, DanmakuResult};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub id: &'static str,
    pub display_name: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportDanmakuXmlPayload {
    pub file_path: String,
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

#[tauri::command]
pub async fn import_danmaku_xml(payload: ImportDanmakuXmlPayload) -> AppResult<DanmakuResult> {
    let file_path = payload.file_path.trim();
    if file_path.is_empty() {
        return Err(AppError::InvalidState(
            "import_danmaku_xml requires a file path".into(),
        ));
    }

    let text = tokio::fs::read_to_string(file_path).await?;
    let episode_id = std::path::Path::new(file_path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("local-xml")
        .to_string();
    Ok(xml::parse_danmaku_xml(&text, episode_id))
}
