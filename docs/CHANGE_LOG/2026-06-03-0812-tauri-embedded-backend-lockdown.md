# 2026-06-03 08:12 - Tauri embedded backend lockdown

## Changed

- Completed the native `mpv-embedded` snapshot path so real playback state now reports tracks, chapters, video params, video output params, OSD dimensions, audio params, hardware decode state, and aspect-related mpv properties.
- Changed embedded detach from "hide the host window" to a real libmpv shutdown plus child-host destroy path.
- Migrated Tauri builds compiled with `mpv-embedded` to force persisted `mpvBackend` back to `embedded` at startup and during settings updates, preventing stale `ipc` settings from spawning a separate top-level `mpv.exe`.

## Verification

- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## Result

Rust verification passes. This closes the first backend cause of the user-reported separate "Drop files or URLs to play here" mpv window, but the release build and real-server visual smoke still must be rerun before claiming playback fixed.
