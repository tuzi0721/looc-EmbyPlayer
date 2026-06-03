# 2026-06-03 21:17 - Stop priority and frame retry

## Changed
- Changed `player.stop()` so local mpv stop and local playback-state cleanup run before the Emby `PlaybackStopped` report, with server reporting continuing asynchronously.
- Improved real-account command-only frame evidence by capturing up to three real mpv screenshots at different seek positions and selecting the first nonblank pixel sample.
- Kept cleanup validation on the route-away unmount path and retained strict embedded hide/detach and residual `mpv.exe` checks.

## Verified
- `node --check scripts\real-server-visual-smoke.mjs`
- `npm.cmd run build`
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## Next
- Rebuild the packaged release and rerun real-account command-only validation against the new executable.
