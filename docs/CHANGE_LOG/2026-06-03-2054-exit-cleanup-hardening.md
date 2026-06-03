# 2026-06-03 20:54 - Exit cleanup hardening

## Changed
- Hardened app-exit playback cleanup so close/tray quit no longer waits for a graceful mpv `stop` IPC reply before tearing down playback.
- Bounded bundled `mpv.exe` shutdown waiting to 2 seconds after `start_kill`, preventing a stuck child process wait from blocking the app shutdown path.
- Tightened the real-account command-only smoke test so player-page cleanup failures for `stop`, embedded host hide, or embedded detach now fail the run instead of being hidden by a later process-table check.

## Verified
- `node --check scripts\real-server-visual-smoke.mjs`
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## Next
- Rebuild the release executable and rerun real-account command-only playback validation so the cleanup gate is checked against the packaged app.
