use std::path::PathBuf;

use crate::config::models::AppSettings;

/// Resolve the mpv executable path.
///
/// Priority:
/// 1. User setting `mpv_executable_path`
/// 2. `<exe-dir>/resources/mpv/mpv.exe` (bundled / build.rs copy)
/// 3. `vendor/mpv/mpv.exe` next to the binary (dev fallback)
/// 4. `"mpv"` on PATH
pub fn resolve_mpv_exe(settings: &AppSettings) -> PathBuf {
    if let Some(p) = settings.mpv_executable_path.as_ref() {
        let trimmed = p.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }

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

    PathBuf::from("mpv")
}

pub fn mpv_exists(settings: &AppSettings) -> bool {
    let path = resolve_mpv_exe(settings);
    if path.is_file() {
        return true;
    }
    which::which(path).is_ok()
}
