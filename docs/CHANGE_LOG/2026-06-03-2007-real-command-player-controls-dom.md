# 2026-06-03 20:07 - Real command player control DOM guard

## Change
- Strengthened `scripts\real-server-visual-smoke.mjs` command-only playback validation to inspect the real player DOM controls after opening playback.
- The verifier now wakes the player controls and fails if the bottom control bar, progress bar, range input, seek-back, play/pause, seek-forward, or fullscreen controls are missing, invisible, zero-sized, or outside the viewport.

## Verification
- `node --check scripts\real-server-visual-smoke.mjs`
- Ran real-account `tauri-release` + `HILLS_REAL_COMMAND_ONLY=1` verification against `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe` with no screenshots.

## Result
- `ok: true`
- `failures: []`
- Real Emby detection/login/media/PlaybackInfo completed.
- Playback selected `DirectPlay`.
- Embedded mpv attach/load completed, and backend pause/resume/seek forward/seek backward all passed.
- New DOM guard passed: bottom bar, progress bar, range input, seek-back, play/pause, seek-forward, and fullscreen controls were visible and inside the viewport.
- Cleanup stop/hide/detach passed, `mpvProcessCount` was `0`, and a follow-up process table check found no residual `emby-player.exe` or `mpv.exe`.

## Next
- Continue remaining real playback/layout issues, with command-only playback now also guarding the visible bottom-control surface.
