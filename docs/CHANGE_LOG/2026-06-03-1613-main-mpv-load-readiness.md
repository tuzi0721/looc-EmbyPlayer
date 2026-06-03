# 2026-06-03 16:13 - main mpv load readiness polling

## Scope

- Enabled mpv events on the main embedded mpv handle instead of creating a secondary event client.
- Added a bounded post-`loadfile` readiness loop that drains main-handle events and checks `duration`, `track-list/count`, `video-codec`, and video params.
- Added diagnostics for `load-ready` and `load-not-ready` without logging stream URLs or tokens.

## Verification

- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## Result

- Rust verification passed.
- The next real command-only run should show whether mpv reaches file-loaded/reconfig/readiness or why it remains empty after `loadfile`.
