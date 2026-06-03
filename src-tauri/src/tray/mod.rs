//! System tray icon + dynamic tooltip + menu.
//!
//! Lives on Windows / macOS (Linux is a soft-fail because tooltips aren't
//! supported there). The tray reflects two live counters:
//! - active downloads (Running / Paused)
//! - unread notifications
//!
//! Clicking the tray icon toggles the main window between shown/hidden.
//! The right-click menu offers quick shortcuts to common destinations.

use std::sync::Arc;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Listener, Manager};

use crate::download::DownloadStatus;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

const TRAY_ID: &str = "emby-player-tray";

pub fn init(app: &AppHandle, state: Arc<AppState>) -> AppResult<()> {
    let show = MenuItem::with_id(app, "tray:show", "显示窗口", true, None::<&str>)
        .map_err(|e| AppError::Other(e.to_string()))?;
    let hide = MenuItem::with_id(app, "tray:hide", "隐藏窗口", true, None::<&str>)
        .map_err(|e| AppError::Other(e.to_string()))?;
    let downloads = MenuItem::with_id(app, "tray:downloads", "下载中心", true, None::<&str>)
        .map_err(|e| AppError::Other(e.to_string()))?;
    let notifications =
        MenuItem::with_id(app, "tray:notifications", "通知中心", true, None::<&str>)
            .map_err(|e| AppError::Other(e.to_string()))?;
    let remote = MenuItem::with_id(app, "tray:remote", "遥控", true, None::<&str>)
        .map_err(|e| AppError::Other(e.to_string()))?;
    let settings = MenuItem::with_id(app, "tray:settings", "设置", true, None::<&str>)
        .map_err(|e| AppError::Other(e.to_string()))?;
    let sep1 = PredefinedMenuItem::separator(app).map_err(|e| AppError::Other(e.to_string()))?;
    let sep2 = PredefinedMenuItem::separator(app).map_err(|e| AppError::Other(e.to_string()))?;
    let quit = MenuItem::with_id(app, "tray:quit", "退出", true, None::<&str>)
        .map_err(|e| AppError::Other(e.to_string()))?;

    let menu = Menu::with_items(
        app,
        &[
            &show,
            &hide,
            &sep1,
            &downloads,
            &notifications,
            &remote,
            &settings,
            &sep2,
            &quit,
        ],
    )
    .map_err(|e| AppError::Other(e.to_string()))?;

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip(initial_tooltip(&state))
        .on_menu_event({
            let state = state.clone();
            move |app, event| handle_menu_event(app, &state, event.id.as_ref())
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                toggle_window(app);
            }
        })
        .build(app)
        .map_err(|e| AppError::Other(e.to_string()))?;

    spawn_tooltip_refresher(app.clone(), state);
    Ok(())
}

fn initial_tooltip(state: &AppState) -> String {
    let downloads = active_downloads(state);
    let unread = state.notifications.unread();
    format_tooltip(downloads, unread)
}

fn format_tooltip(downloads: usize, unread: usize) -> String {
    format!("Hills Lite\n下载中: {downloads} · 未读: {unread}")
}

fn active_downloads(state: &AppState) -> usize {
    state
        .downloads
        .list()
        .into_iter()
        .filter(|t| {
            matches!(
                t.status,
                DownloadStatus::Running | DownloadStatus::Paused | DownloadStatus::Pending
            )
        })
        .count()
}

fn handle_menu_event(app: &AppHandle, state: &Arc<AppState>, id: &str) {
    match id {
        "tray:show" => {
            show_window(app);
        }
        "tray:hide" => {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.hide();
            }
        }
        "tray:downloads" => {
            show_window(app);
            let _ = app.emit("nav:goto", "/downloads");
        }
        "tray:notifications" => {
            show_window(app);
            let _ = app.emit("nav:goto", "/notifications-open");
            // The store listens for "nav:goto" with "/notifications-open" and
            // toggles the in-app drawer; "/downloads" / route strings get
            // pushed onto the router.
        }
        "tray:remote" => {
            show_window(app);
            let _ = app.emit("nav:goto", "/remote");
        }
        "tray:settings" => {
            show_window(app);
            let _ = app.emit("nav:goto", "/settings");
        }
        "tray:quit" => {
            tauri::async_runtime::block_on(state.shutdown_playback());
            app.exit(0);
        }
        other => tracing::debug!(target = "tray", "unknown menu id: {other}"),
    }
    refresh_tooltip(app, state);
}

fn toggle_window(app: &AppHandle) {
    let Some(w) = app.get_webview_window("main") else {
        return;
    };
    match w.is_visible() {
        Ok(true) => {
            // If visible but not focused, focus it; otherwise hide.
            if w.is_focused().unwrap_or(false) {
                let _ = w.hide();
            } else {
                let _ = w.set_focus();
            }
        }
        _ => {
            show_window(app);
        }
    }
}

fn show_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Lightweight tooltip refresher: subscribes to download / notification
/// events emitted by the rest of the app and refreshes the tray tooltip
/// (best effort; Linux silently no-ops on `set_tooltip`).
fn spawn_tooltip_refresher(app: AppHandle, state: Arc<AppState>) {
    let app_clone = app.clone();
    let state_clone = state.clone();
    app.listen_any("notification:unread", move |_| {
        refresh_tooltip(&app_clone, &state_clone);
    });
    let app_clone = app.clone();
    let state_clone = state.clone();
    app.listen_any("download:state", move |_| {
        refresh_tooltip(&app_clone, &state_clone);
    });
    let app_clone = app.clone();
    let state_clone = state.clone();
    app.listen_any("download:progress", move |_| {
        refresh_tooltip(&app_clone, &state_clone);
    });
}

fn refresh_tooltip(app: &AppHandle, state: &AppState) {
    let downloads = active_downloads(state);
    let unread = state.notifications.unread();
    let text = format_tooltip(downloads, unread);
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(text));
    }
}
