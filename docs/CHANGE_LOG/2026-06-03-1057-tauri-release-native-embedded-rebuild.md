# 2026-06-03 10:57 - Tauri release rebuild with native embedded backend

## Changed

- Rebuilt the Tauri `mpv-embedded` release after reverting the IPC embedded fallback and restoring the native libmpv embedded backend.

## Verification

- `cargo build --manifest-path src-tauri\Cargo.toml --release --features mpv-embedded --offline`

## Artifact

- `src-tauri\target\release\emby-player.exe`
- Timestamp: `2026/6/3 10:57:33`
- Size: `8,141,824` bytes
- Same-directory runtime DLLs confirmed:
  - `libmpv-2.dll`
  - `d3dcompiler_43.dll`

## Result

The latest exe no longer contains the Tauri IPC embedded fallback that produced an idle top-level mpv window. No screenshot-based visual smoke was run in this phase after the user asked to stop screenshot attempts.
