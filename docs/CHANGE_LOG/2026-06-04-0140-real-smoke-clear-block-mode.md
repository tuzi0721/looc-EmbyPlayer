# 2026-06-04 01:40 - Real Smoke Clear Block Mode

## Summary
- Added `HILLS_REAL_EXPECT_CLEAR_BLOCK=1` to the real-account command-only smoke script.
- In this explicit mode, the script treats a clear pre-mpv playback block as the expected result.
- Normal command-only playback still requires real video readiness, controls, frame evidence, embedded window ownership, and cleanup.

## Clear Block Requirements
- Player route mounts.
- A visible player error is displayed.
- Backend does not reach `play:mpv-load-start`.
- Backend does not complete mpv load.
- No visible top-level `mpv.exe` window appears.
- Cleanup route-away and embedded detach pass.
- No `mpv.exe` process remains.

## Verification
- `node --check scripts\real-server-visual-smoke.mjs`
- `git diff --check`

## Next
- Rerun the fixed-item real smoke with `HILLS_REAL_EXPECT_CLEAR_BLOCK=1` for MP4 item `34535`.
