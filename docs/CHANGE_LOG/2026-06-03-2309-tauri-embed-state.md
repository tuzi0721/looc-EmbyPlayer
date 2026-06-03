# 2026-06-03 23:09 - Tauri Embed State

## Summary
- Added a Tauri `get_embed_state` command so real playback validation can target the app-owned embedded native child window directly.
- Exposed the current embedded host window handle from `HostWindow`, the mpv IPC backend, the libmpv embedded backend, and `MpvManager`.
- The Tauri embed state reports `mode`, `hostKind`, `runtime`, `hwnd`, `hostWindowHandle`, and `attachedMpvWindowHandle`.
- Updated the real-server visual smoke script to use the Tauri embed state instead of broad native window enumeration.
- Added a typed frontend API wrapper for `get_embed_state`.

## Verification
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`
- `npm.cmd run build`
- `node --check scripts\real-server-visual-smoke.mjs`
- `git diff --check`

## Next
- Rebuild the packaged release, then rerun the real-account command-only playback guard.
