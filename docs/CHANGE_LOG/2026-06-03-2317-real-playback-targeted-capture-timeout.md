# 2026-06-03 23:17 - Real Playback Targeted Capture Timeout

## Summary
- Reran the real-account command-only playback guard against the release containing Tauri `get_embed_state`.
- Product cleanup and playback controls still passed, but frame evidence still failed.
- Targeting the app-owned hwnd did not fix the PowerShell capture timeout, so the remaining issue is the capture method itself.

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
- Change the native capture method for known hwnd captures from screen `CopyFromScreen` to `PrintWindow(PW_RENDERFULLCONTENT)` to avoid the hanging screen-copy path.
