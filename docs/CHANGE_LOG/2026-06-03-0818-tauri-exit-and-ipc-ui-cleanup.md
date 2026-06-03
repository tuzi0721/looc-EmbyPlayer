# 2026-06-03 08:18 - Tauri exit cleanup and IPC UI cleanup

## Changed

- Changed the frontend default `mpvBackend` from `ipc` to `embedded`.
- Removed the interactive IPC/embedded selector from the settings player panel and replaced it with a read-only backend label.
- Updated the settings about panel to show a user-facing backend label instead of the raw setting value.
- Added `AppState::shutdown_playback()` and wired it to Tauri window close, app exit, and tray quit so mpv is explicitly stopped/shutdown and current playback state is cleared during exit.
- Updated the real-server visual smoke setup to force `mpvBackend: "embedded"` and assert that Tauri real smoke is not running against a stale IPC backend.

## Verification

- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`
- `node --check scripts\real-server-visual-smoke.mjs`
- `npm.cmd run build`

## Result

Rust, smoke-script syntax, local-decode guard, no-planned-UI guard, TypeScript, and Vite build all pass. Next required step is rebuilding the Tauri release exe and rerunning real-account visual smoke.
