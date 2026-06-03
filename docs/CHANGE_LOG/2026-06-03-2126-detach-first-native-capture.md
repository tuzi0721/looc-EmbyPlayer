# 2026-06-03 21:26 - Detach-first cleanup and native capture

## Changed
- Changed embedded PlayerView unmount cleanup to hide and detach the native mpv host before clearing store state without issuing a second backend stop.
- Added `player.stop({ stopBackend: false })` for cases where another cleanup path already tore down the local mpv backend.
- Split command-only validation so it captures the native app window while playback is still visible, then routes away and validates embedded hide/detach cleanup.

## Verified
- `node --check scripts\real-server-visual-smoke.mjs`
- `npm.cmd run build`
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## Next
- Rebuild the packaged release and rerun real-account command-only validation against the new executable.
