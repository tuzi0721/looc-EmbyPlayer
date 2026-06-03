# 2026-06-03 23:06 - Real Playback Window Fallback Still Fails

## Summary
- Reran the real-account command-only playback guard against the release containing the mpv `window` screenshot fallback.
- Product playback cleanup stayed fixed, but frame evidence still failed.
- The mpv screenshot command still returned `mpv error: error running command`, which means subtitles/video/window screenshot modes are all unavailable on this embedded `--wid` path in the real release environment.

## Evidence
- Result: `ok: false`.
- Remaining failures:
  - `mpv frame screenshot is missing or visually blank: mpv error: mpv error: error running command`
  - `native playback capture failed: powershell failed: spawnSync powershell ETIMEDOUT`
- Passing product evidence:
  - `DirectPlay`
  - `stateReady: true`
  - `domControlsOk: true`
  - `cleanupDetachedHost: true`
  - `mpvProcessCount: 0`
  - pause/resume/seek forward/seek backward passed
- Follow-up cleanup check: temporary real-credential input file was deleted; no residual `emby-player.exe` or `mpv.exe` remained.

## Next
- Expose the Tauri embedded host/native child window state so validation can target the app-owned child hwnd directly instead of relying on mpv screenshots or broad screen capture.
