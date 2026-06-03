# 2026-06-03 10:04 - Player embedded attach diagnostics

## Changed

- Added visual-smoke diagnostics around Tauri `embed_attach`, `embed_set_visible`, and `embed_detach` commands.
- Added frontend timeout guards around `api.embedAttach()` and `api.embedSetVisible(true)` so `PlayerView` cannot hang forever before `startCurrentPlayback()`.

## Verification

- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`
- `node --check scripts\real-server-visual-smoke.mjs`
- `npm.cmd run build`

## Result

Source verification passes. This is a diagnostic hardening step after the real smoke `Runtime.evaluate timeout`; it does not claim playback is fixed until a new release smoke passes.
