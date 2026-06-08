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
