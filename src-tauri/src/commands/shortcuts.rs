//! Global keyboard shortcuts. Users bind named app-level actions
//! (`play_pause`, `stop`, `volume_up`, `volume_down`, `toggle_window`) to
//! system-wide accelerators. Defaults are seeded on first launch from
//! [`default_bindings`].

use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::error::{AppError, AppResult};
use crate::state::AppState;

const KEY_SHORTCUTS: &str = "global_shortcuts";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutBinding {
    pub action: String,
    pub accelerator: String,
}

#[derive(Default, Clone)]
pub struct ShortcutRegistry {
    pub current: Arc<Mutex<HashMap<String, String>>>,
}

impl ShortcutRegistry {
    pub fn snapshot(&self) -> Vec<ShortcutBinding> {
        self.current
            .lock()
            .iter()
            .map(|(action, accel)| ShortcutBinding {
                action: action.clone(),
                accelerator: accel.clone(),
            })
            .collect()
    }
}

pub fn default_bindings() -> Vec<ShortcutBinding> {
    vec![
        ShortcutBinding {
            action: "play_pause".into(),
            accelerator: "MediaPlayPause".into(),
        },
        ShortcutBinding {
            action: "stop".into(),
            accelerator: "MediaStop".into(),
        },
        ShortcutBinding {
            action: "next_track".into(),
            accelerator: "MediaTrackNext".into(),
        },
        ShortcutBinding {
            action: "prev_track".into(),
            accelerator: "MediaTrackPrevious".into(),
        },
        ShortcutBinding {
            action: "toggle_window".into(),
            accelerator: "CommandOrControl+Alt+E".into(),
        },
    ]
}

pub fn init_app(handle: &AppHandle, state: &Arc<AppState>) -> AppResult<()> {
    let bindings = load_bindings(state);
    let registry = state.shortcuts.clone();
    for b in &bindings {
        if let Err(e) = register(handle, &registry, &b.action, &b.accelerator) {
            tracing::warn!(target = "shortcuts", action = %b.action, accel = %b.accelerator, error = %e, "skip default shortcut");
        }
    }
    Ok(())
}

fn load_bindings(state: &Arc<AppState>) -> Vec<ShortcutBinding> {
    match state.config.get_raw(KEY_SHORTCUTS) {
        Some(v) => match serde_json::from_value::<Vec<ShortcutBinding>>(v) {
            Ok(v) if !v.is_empty() => v,
            _ => default_bindings(),
        },
        None => default_bindings(),
    }
}

fn register(
    handle: &AppHandle,
    registry: &ShortcutRegistry,
    action: &str,
    accelerator: &str,
) -> AppResult<()> {
    let shortcut: Shortcut = accelerator
        .parse()
        .map_err(|e| AppError::Other(format!("invalid accelerator {accelerator}: {e}")))?;
    let action_owned = action.to_string();

    let app_clone = handle.clone();
    let manager = handle.global_shortcut();
    manager
        .on_shortcut(shortcut, move |_app, _sc, event| {
            if event.state() == ShortcutState::Pressed {
                let _ = app_clone.emit("shortcut:trigger", &action_owned);
                if action_owned == "toggle_window" {
                    if let Some(win) = app_clone.get_webview_window("main") {
                        match win.is_visible().unwrap_or(false) {
                            true if win.is_focused().unwrap_or(false) => {
                                let _ = win.hide();
                            }
                            true => {
                                let _ = win.set_focus();
                            }
                            false => {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                }
            }
        })
        .map_err(|e| AppError::Other(format!("global shortcut register: {e}")))?;

    registry
        .current
        .lock()
        .insert(action.to_string(), accelerator.to_string());
    Ok(())
}

fn unregister(handle: &AppHandle, registry: &ShortcutRegistry, action: &str) -> AppResult<()> {
    let accel = registry.current.lock().remove(action);
    if let Some(accel) = accel {
        if let Ok(shortcut) = accel.parse::<Shortcut>() {
            let _ = handle.global_shortcut().unregister(shortcut);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn list_global_shortcuts(
    state: State<'_, Arc<AppState>>,
) -> AppResult<Vec<ShortcutBinding>> {
    Ok(state.shortcuts.snapshot())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetShortcutPayload {
    pub action: String,
    pub accelerator: String,
}

#[tauri::command]
pub async fn set_global_shortcut(
    handle: AppHandle,
    state: State<'_, Arc<AppState>>,
    payload: SetShortcutPayload,
) -> AppResult<Vec<ShortcutBinding>> {
    unregister(&handle, &state.shortcuts, &payload.action)?;
    register(
        &handle,
        &state.shortcuts,
        &payload.action,
        &payload.accelerator,
    )?;
    persist(&state)?;
    Ok(state.shortcuts.snapshot())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearShortcutPayload {
    pub action: String,
}

#[tauri::command]
pub async fn clear_global_shortcut(
    handle: AppHandle,
    state: State<'_, Arc<AppState>>,
    payload: ClearShortcutPayload,
) -> AppResult<Vec<ShortcutBinding>> {
    unregister(&handle, &state.shortcuts, &payload.action)?;
    persist(&state)?;
    Ok(state.shortcuts.snapshot())
}

#[tauri::command]
pub async fn reset_global_shortcuts(
    handle: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> AppResult<Vec<ShortcutBinding>> {
    let actions: Vec<String> = state.shortcuts.current.lock().keys().cloned().collect();
    for a in actions {
        unregister(&handle, &state.shortcuts, &a)?;
    }
    for b in default_bindings() {
        if let Err(e) = register(&handle, &state.shortcuts, &b.action, &b.accelerator) {
            tracing::warn!(target = "shortcuts", error = %e, "reset register failed");
        }
    }
    persist(&state)?;
    Ok(state.shortcuts.snapshot())
}

fn persist(state: &State<'_, Arc<AppState>>) -> AppResult<()> {
    let bindings = state.shortcuts.snapshot();
    state
        .config
        .set_raw(KEY_SHORTCUTS, serde_json::to_value(&bindings)?)?;
    Ok(())
}
