# 2026-06-03 22:44 - Embedded Cleanup Timeout

## Summary
- Fixed the embedded playback unmount path after the real command-only guard showed cleanup stopped at `embed_visible:hide` and never reached `embed_detach`.
- Player unmount now tears down the embedded host by going directly to detach, instead of first awaiting a potentially stuck hide call.
- Embedded hide and detach calls now have bounded frontend timeouts.
- If detach fails or times out, the player store now falls back to a backend stop instead of clearing state while leaving mpv running.
- Hardened the real command-only verifier so mpv's internal `screenshot-to-file` failure can be followed by native-window pixel capture for real embedded frame evidence.
- Updated the cleanup guard so direct detach does not require a separate hide event.

## Verification
- `node --check scripts\real-server-visual-smoke.mjs`
- `npm.cmd run build`
- `git diff --check`

## Next
- Rebuild the packaged Tauri release, then rerun the real-account command-only playback guard against the new exe.
