# 2026-06-03 22:57 - Real Playback Capture Timeout

## Summary
- Reran the real-account command-only playback guard after adding a hard timeout to native capture.
- The verifier no longer hangs: native capture returned a clear timeout failure.
- Product cleanup stayed fixed: route-away reached `embed_detach:complete` and `mpvProcessCount` was `0`.

## Evidence
- Result: `ok: false`.
- Remaining failures:
  - `mpv frame screenshot is missing or visually blank: mpv error: mpv error: error running command`
  - `native playback capture failed: powershell failed: spawnSync powershell ETIMEDOUT`
- Passing product evidence:
  - `stateReady: true`
  - `domControlsOk: true`
  - `cleanupDetachedHost: true`
  - `mpvProcessCount: 0`
  - visible bottom controls, pause/resume, seek forward, and seek backward passed
- Follow-up cleanup check: temporary credential input was deleted; no residual `emby-player.exe` or `mpv.exe` remained.

## Next
- Replace the command-only frame evidence path with a non-screen-capture signal that works for embedded `--wid` playback, or expose a reliable app-owned native-frame capture path.
