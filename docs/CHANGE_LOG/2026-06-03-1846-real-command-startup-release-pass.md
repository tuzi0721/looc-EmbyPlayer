# 2026-06-03 18:46 real command-only release pass

## Verification

- Ran the latest release executable in real-server command-only mode without screenshots.
- The run used the real test server credentials via a temporary input file; output was redacted.

## Evidence

- Tauri release launched and exposed the app bridge/router.
- Startup requests completed:
  - settings
  - server detection
  - add server
  - login
  - home route
  - views
  - resume
  - hero media
  - media list
  - series list
  - PlaybackInfo
- Emby was detected automatically.
- Login succeeded.
- PlaybackInfo selected `DirectPlay`.
- Embedded playback reached:
  - `embed_attach:complete`
  - `play:stream-proxy-ready`
  - `play:mpv-load-complete`
  - `play:return`
- Player state became ready.
- Controls passed:
  - pause
  - resume
  - seek forward
  - seek backward
- Cleanup passed:
  - stop
  - hide
  - detach
- Independent `mpv.exe` count was `0`.

## Result

- `ok: true`
- `failures: []`

## Next

- Continue with the remaining user-visible layout and visual-output issues.
