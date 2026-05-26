//! Bridge between the in-app `NotificationCenter` and the host OS notification
//! surface (Windows Action Center, macOS Notification Center, Linux libnotify).
//!
//! We only fire native notifications when the main window is **not focused**
//! so that an in-app toast is the preferred surface while the user is
//! actively engaging with the player.

use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::notifications::types::{Notification, NotificationKind};

pub fn maybe_notify(app: &AppHandle, n: &Notification) {
    // Skip plain info-level toasts; OS notifications should be reserved for
    // actionable / important events.
    if matches!(n.kind, NotificationKind::Info) {
        return;
    }
    if is_focused(app) {
        return;
    }
    let body = n.body.clone().unwrap_or_default();
    let res = app
        .notification()
        .builder()
        .title(&n.title)
        .body(body)
        .show();
    if let Err(e) = res {
        tracing::warn!(target = "notifications", error = %e, "os notify failed");
    }
}

fn is_focused(app: &AppHandle) -> bool {
    match app.get_webview_window("main") {
        Some(w) => w.is_focused().unwrap_or(false),
        None => false,
    }
}
