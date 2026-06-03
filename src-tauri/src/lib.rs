mod commands;
mod config;
mod danmaku;
mod download;
mod emby;
mod error;
mod mpv;
mod network;
mod notifications;
mod state;
mod stream_proxy;
mod system_media;
mod tray;

use std::sync::Arc;

use tauri::Manager;
use tracing_subscriber::EnvFilter;

pub use error::{AppError, AppResult};
pub use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_crash_logger();

    let mut context = tauri::generate_context!();
    apply_visual_smoke_browser_args(&mut context);

    // tokio-tungstenite (Emby WebSocket) uses rustls 0.23 which requires an
    // explicit process-wide CryptoProvider before any TLS connection.
    let _ = rustls::crypto::ring::default_provider().install_default();

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,emby_player=debug")),
        )
        .with_target(false)
        .init();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            let state = Arc::new(AppState::initialize(handle)?);
            app.manage(state.clone());

            let _ = app.handle().remove_menu();
            let _ = app.handle().hide_menu();
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.remove_menu();
                let _ = window.hide_menu();
            }

            // Windows vibrancy (acrylic/mica) is disabled because it requires
            // a transparent webview which causes severe drag-lag on Windows.
            // The CSS .app-backdrop already paints a dark gradient.
            #[cfg(target_os = "macos")]
            {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = window_vibrancy::apply_vibrancy(
                        &w,
                        window_vibrancy::NSVisualEffectMaterial::HudWindow,
                        None,
                        Some(12.0),
                    );
                }
            }

            if let Err(e) = tray::init(app.handle(), state.clone()) {
                tracing::warn!(target = "tray", error = %e, "tray init failed");
            }

            if let Err(e) = commands::shortcuts::init_app(app.handle(), &state) {
                tracing::warn!(target = "shortcuts", error = %e, "global shortcut init failed");
            }

            if let Err(e) = state.system_media.attach(app.handle().clone()) {
                tracing::warn!(target = "smtc", error = %e, "system media attach failed");
            }

            tauri::async_runtime::spawn(async move {
                state.spawn_background_workers().await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::login,
            commands::auth::logout,
            commands::auth::list_accounts,
            commands::auth::switch_account,
            commands::server::list_servers,
            commands::server::detect_server,
            commands::server::add_server,
            commands::server::update_server,
            commands::server::remove_server,
            commands::server::test_lines,
            commands::server::set_active_line,
            commands::media::list_views,
            commands::media::list_items,
            commands::media::list_items_all_accounts,
            commands::media::get_item_detail,
            commands::media::set_item_favorite,
            commands::media::set_item_played,
            commands::media::search,
            commands::media::search_all_accounts,
            commands::media::resume_items,
            commands::media::resume_items_all_accounts,
            commands::media::list_seasons,
            commands::media::list_episodes,
            commands::media::similar_items,
            commands::media::special_features,
            commands::media::report_playback_progress,
            commands::media::report_playback_stopped,
            commands::player::get_playback_source,
            commands::player::play,
            commands::player::play_external,
            commands::player::pause,
            commands::player::resume,
            commands::player::stop,
            commands::player::seek,
            commands::player::seek_relative,
            commands::player::set_speed,
            commands::player::set_audio_track,
            commands::player::set_subtitle_track,
            commands::player::set_secondary_subtitle_track,
            commands::player::get_state,
            commands::player::embed_attach,
            commands::player::embed_set_rect,
            commands::player::embed_set_visible,
            commands::player::embed_detach,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::export_config,
            commands::settings::import_config,
            commands::danmaku::list_danmaku_providers,
            commands::danmaku::fetch_danmaku,
            commands::danmaku::import_danmaku_xml,
            commands::download::list_downloads,
            commands::download::open_download_directory,
            commands::download::start_download,
            commands::download::pause_download,
            commands::download::resume_download,
            commands::download::cancel_download,
            commands::download::remove_download,
            commands::download::play_local,
            commands::player::play_file,
            commands::player::list_local_folder,
            commands::subtitle::list_subtitles,
            commands::subtitle::search_online_subtitles,
            commands::subtitle::resolve_online_subtitle,
            commands::subtitle::add_subtitle,
            commands::subtitle::remove_subtitle,
            commands::subtitle::set_subtitle_delay,
            commands::subtitle::set_subtitle_scale,
            commands::subtitle::set_subtitle_style,
            commands::subtitle::cycle_subtitle,
            commands::notifications::list_notifications,
            commands::notifications::unread_count,
            commands::notifications::dismiss_notification,
            commands::notifications::mark_notification_read,
            commands::notifications::mark_all_notifications_read,
            commands::notifications::clear_notifications,
            commands::player::set_volume,
            commands::player::set_muted,
            commands::player::set_picture_mode,
            commands::player::show_mpv_stats_osd,
            commands::player::take_screenshot,
            commands::player::open_external,
            commands::player::open_path,
            commands::player::set_always_on_top,
            commands::player::set_fullscreen,
            commands::player::set_secondary_display_blackout,
            commands::remote::list_remote_sessions,
            commands::remote::remote_playstate,
            commands::remote::remote_play,
            commands::remote::remote_set_volume,
            commands::remote::remote_display_message,
            commands::shortcuts::list_global_shortcuts,
            commands::shortcuts::set_global_shortcut,
            commands::shortcuts::clear_global_shortcut,
            commands::shortcuts::reset_global_shortcuts,
            commands::system_media::set_now_playing,
            commands::system_media::set_now_playing_status,
            commands::system_media::set_now_playing_position,
            commands::system_media::clear_now_playing,
        ])
        .build(context)
        .unwrap_or_else(|e| {
            let msg = format!("tauri::build failed: {e}");
            log_crash_line(&msg);
            // Panic so the OS terminates the process with the message visible.
            panic!("{msg}");
        });
    app.run(|app, event| match event {
        tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
            cleanup_playback_on_exit(app);
        }
        tauri::RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::CloseRequested { .. },
            ..
        } if label == "main" => {
            cleanup_playback_on_exit(app);
        }
        _ => {}
    });
}

fn cleanup_playback_on_exit(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<Arc<AppState>>() else {
        return;
    };
    tauri::async_runtime::block_on(state.shutdown_playback());
}

#[cfg(target_os = "windows")]
fn apply_visual_smoke_browser_args<R: tauri::Runtime>(context: &mut tauri::Context<R>) {
    let Ok(port) = std::env::var("HILLS_TAURI_CDP_PORT") else {
        return;
    };
    let Ok(port) = port.parse::<u16>() else {
        return;
    };
    if port == 0 {
        return;
    }

    let data_dir = std::env::var_os("HILLS_TAURI_WEBVIEW_DATA_DIR").map(std::path::PathBuf::from);
    let defaults = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required";
    for window in &mut context.config_mut().app.windows {
        let mut args = window
            .additional_browser_args
            .clone()
            .unwrap_or_else(|| defaults.to_string());
        if !args.contains("--remote-debugging-port=") {
            args.push_str(&format!(" --remote-debugging-port={port}"));
        }
        window.additional_browser_args = Some(args);
        if let Some(data_dir) = data_dir.as_ref() {
            window.data_directory = Some(data_dir.clone());
        }
    }

    log_visual_smoke_line(&format!(
        "cdp port {port} configured; webview data dir: {}",
        data_dir
            .as_ref()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| "<default>".to_string())
    ));
}

#[cfg(not(target_os = "windows"))]
fn apply_visual_smoke_browser_args<R: tauri::Runtime>(_context: &mut tauri::Context<R>) {}

fn log_visual_smoke_line(msg: &str) {
    let path = std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .or_else(|| dirs_next())
        .unwrap_or_else(std::env::temp_dir);
    let dir = path.join("EmbyPlayer");
    let _ = std::fs::create_dir_all(&dir);
    let file = dir.join("visual-smoke.log");
    let when = chrono::Utc::now().to_rfc3339();
    let line = format!("{when} {msg}\n");
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file)
        .and_then(|mut f| std::io::Write::write_all(&mut f, line.as_bytes()));
}

fn log_crash_line(msg: &str) {
    let path = std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .or_else(|| dirs_next())
        .unwrap_or_else(std::env::temp_dir);
    let dir = path.join("EmbyPlayer");
    let _ = std::fs::create_dir_all(&dir);
    let file = dir.join("crash.log");
    let when = chrono::Utc::now().to_rfc3339();
    let line = format!("=== fatal ===\n{when}\n{msg}\n\n");
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file)
        .and_then(|mut f| std::io::Write::write_all(&mut f, line.as_bytes()));
}

/// Writes panic info to `<config-dir>/EmbyPlayer/crash.log` so launch crashes
/// in release builds (where stderr is invisible) can still be inspected.
fn install_crash_logger() {
    std::panic::set_hook(Box::new(|info| {
        let path = std::env::var_os("LOCALAPPDATA")
            .map(std::path::PathBuf::from)
            .or_else(|| dirs_next())
            .unwrap_or_else(std::env::temp_dir);
        let dir = path.join("EmbyPlayer");
        let _ = std::fs::create_dir_all(&dir);
        let file = dir.join("crash.log");

        let when = chrono::Utc::now().to_rfc3339();
        let payload = info.payload();
        let msg = payload
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| payload.downcast_ref::<String>().map(String::as_str))
            .unwrap_or("<non-string panic>");
        let loc = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "<unknown location>".to_string());

        let line = format!("=== panic ===\n{when}\n{loc}\n{msg}\n\n");
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&file)
            .and_then(|mut f| std::io::Write::write_all(&mut f, line.as_bytes()));
        eprintln!("{line}");
    }));
}

fn dirs_next() -> Option<std::path::PathBuf> {
    std::env::var_os("USERPROFILE")
        .map(std::path::PathBuf::from)
        .map(|p| p.join("AppData").join("Local"))
}
