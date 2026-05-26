use std::sync::Arc;

use serde::Deserialize;
use tauri::State;

use crate::error::AppResult;
use crate::notifications::Notification;
use crate::state::AppState;

#[tauri::command]
pub async fn list_notifications(
    state: State<'_, Arc<AppState>>,
) -> AppResult<Vec<Notification>> {
    Ok(state.notifications.list())
}

#[tauri::command]
pub async fn unread_count(state: State<'_, Arc<AppState>>) -> AppResult<usize> {
    Ok(state.notifications.unread())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotifRefPayload {
    pub id: String,
}

#[tauri::command]
pub async fn dismiss_notification(
    state: State<'_, Arc<AppState>>,
    payload: NotifRefPayload,
) -> AppResult<()> {
    state.notifications.dismiss(&payload.id)
}

#[tauri::command]
pub async fn mark_notification_read(
    state: State<'_, Arc<AppState>>,
    payload: NotifRefPayload,
) -> AppResult<()> {
    state.notifications.mark_read(&payload.id)
}

#[tauri::command]
pub async fn mark_all_notifications_read(state: State<'_, Arc<AppState>>) -> AppResult<()> {
    state.notifications.mark_all_read()
}

#[tauri::command]
pub async fn clear_notifications(state: State<'_, Arc<AppState>>) -> AppResult<()> {
    state.notifications.clear()
}
