# 2026-06-03 11:18 - Tauri startup no auto mpv sanity

## Verification

- Started `src-tauri\target\release\emby-player.exe`.
- Waited 8 seconds.
- Queried the process tree for the app process, child processes, and any `mpv` process.
- Stopped the test app process.

## Result

- The process tree contained `emby-player.exe` and WebView2.
- No `mpv.exe` process appeared during startup.
- This check did not connect to the real server and did not run screenshot-based visual smoke.

## Remaining Risk

Playback still needs a targeted non-screenshot/manual check. This phase only confirms the latest exe no longer auto-spawns an independent idle mpv process at startup.
