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
