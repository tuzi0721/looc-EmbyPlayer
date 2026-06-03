# 2026-06-03 12:08 native mpv event diagnostics

## Scope

- Added a persistent libmpv event client for the Tauri native embedded backend.
- The event pump records load generations, file-loaded count, reconfig counts, last event, last property, and last error without logging stream URLs or auth tokens.
- `get_state` now exposes `backendDiagnostics` for the embedded backend; IPC returns `null`.
- Command-only real-smoke output now includes `backendDiagnostics` when mpv state does not become ready.

## Verification

- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`
- `node --check scripts\real-server-visual-smoke.mjs`
- `npm.cmd run build`

## Result

This phase is diagnostic only. It does not claim playback is fixed yet. The next phase is to rebuild the Tauri release and rerun the real-account command-only smoke without screenshots so the async libmpv load result is visible.
