use std::path::PathBuf;

/// Resolve the mpv executable path.
///
/// Priority:
/// 1. `<exe-dir>/resources/mpv/mpv.exe` (bundled / build.rs copy)
/// 2. `<exe-dir>/mpv/mpv.exe` (packaged resource fallback)
pub fn resolve_mpv_exe() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for rel in ["resources/mpv/mpv.exe", "mpv/mpv.exe"] {
                let candidate = dir.join(rel);
                if candidate.is_file() {
                    return candidate;
                }
            }
        }
    }

    PathBuf::from("resources/mpv/mpv.exe")
}

/// File name of the bundled mpv progress reporter Lua script.
pub const REPORTER_SCRIPT_NAME: &str = "hills_external_reporter.lua";

/// Resolve the bundled mpv progress reporter Lua script, if present.
///
/// The script lives beside the bundled mpv runtime (`resources/mpv/`) and is
/// injected into mpv via `--script=<path>` so external / embedded mpv processes
/// emit `HILLS_MPV_EVENT:` progress events on stdout. Returns `None` when the
/// script cannot be located so callers can degrade gracefully (mpv simply runs
/// without the reporter).
/// Resolve the bundled Anime4K GLSL shader directory (`resources/mpv/shaders`).
pub fn resolve_shader_dir() -> Option<PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for rel in ["resources/mpv/shaders", "mpv/shaders"] {
                let candidate = dir.join(rel);
                if candidate.is_dir() {
                    return Some(candidate);
                }
            }
        }
    }

    #[cfg(debug_assertions)]
    {
        let candidate = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/mpv/shaders");
        if candidate.is_dir() {
            return Some(candidate);
        }
    }

    let fallback = PathBuf::from("resources/mpv/shaders");
    fallback.is_dir().then_some(fallback)
}

/// Location of the user-editable mpv.conf (reference parity: HillsLite
/// 设置·调试「编辑 mpv.conf」). Lives next to the app config store
/// (`%APPDATA%/app.embyplayer/mpv.conf`) and is injected into every mpv spawn
/// via `--include` when present.
pub fn resolve_user_mpv_conf() -> Option<PathBuf> {
    let base = std::env::var_os("APPDATA").map(PathBuf::from)?;
    Some(base.join("app.embyplayer").join("mpv.conf"))
}

/// Directory for mpv log files (reference parity: HillsLite 设置·调试
/// 「播放器日志」). Shared by both runtimes: `%APPDATA%/app.embyplayer/logs`.
pub fn resolve_player_log_dir() -> Option<PathBuf> {
    let base = std::env::var_os("APPDATA").map(PathBuf::from)?;
    Some(base.join("app.embyplayer").join("logs"))
}

pub fn resolve_reporter_script() -> Option<PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for rel in ["resources/mpv", "mpv"] {
                let candidate = dir.join(rel).join(REPORTER_SCRIPT_NAME);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }

    let fallback = PathBuf::from("resources/mpv").join(REPORTER_SCRIPT_NAME);
    fallback.is_file().then_some(fallback)
}
