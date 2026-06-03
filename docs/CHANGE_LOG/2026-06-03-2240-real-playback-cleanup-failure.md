# 2026-06-03 22:40 - Real Playback Cleanup Failure

## Summary
- Reran the real-account command-only playback guard against the packaged Tauri release after the personal-media phase passed.
- The guard confirmed real login, real PlaybackInfo, and local decode selection: playback used `DirectPlay`, the selected media source supported direct play/direct stream, and `supportsTranscoding` was false.
- The player route mounted, mpv reached load, playback state reported a video track, and DOM bottom controls were visible. Pause/resume, seek forward, and seek backward all passed.
- The guard failed on the real embedded playback evidence/cleanup path.

## Failure Evidence
- Result: `ok: false`.
- Failures:
  - `mpv frame screenshot is missing or visually blank: mpv error: mpv error: error running command`
  - `player cleanup did not detach embedded host`
  - `independent mpv.exe process is running`
- Runtime evidence:
  - `attached: true`
  - `backendReachedLoad: true`
  - `backendCompletedLoad: true`
  - `stateReady: true`
  - `domControlsOk: true`
  - `framePixelOk: false`
  - `cleanupHidHost: true`
  - `cleanupDetachedHost: false`
  - `mpvProcessCount: 1`
- Follow-up cleanup check: temporary real-credential input file was deleted; no residual `emby-player.exe` or `mpv.exe` remained by the later independent process-table check.

## Next
- Fix embedded playback cleanup ordering so route-away/app-close waits for or forces host detach before considering playback stopped.
- Re-run the real command-only guard until it passes with real frame evidence and no in-window or follow-up process residue.
