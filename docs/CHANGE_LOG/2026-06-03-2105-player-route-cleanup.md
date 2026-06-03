# 2026-06-03 21:05 - Player route cleanup validation

## Changed
- Exposed `stopPolling` from the player store so PlayerView can stop `get_state` polling before tearing down embedded playback.
- Reordered PlayerView unmount cleanup to stop polling, hide the embedded host, stop playback, then detach the embedded host.
- Updated the real-account command-only verifier to clean up by routing away from `/player/...`, waiting for PlayerView unmount cleanup, and requiring embedded hide/detach log evidence plus no residual `mpv.exe`.

## Verified
- `node --check scripts\real-server-visual-smoke.mjs`
- `npm.cmd run build`
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## Next
- Rebuild the packaged release and rerun real-account command-only validation against the new executable.
