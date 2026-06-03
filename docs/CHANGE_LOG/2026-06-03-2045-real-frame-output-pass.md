# 2026-06-03 20:45 - Real frame output pass

## Change
- Kept embedded playback on the bundled `mpv.exe --wid` IPC path so the player remains in-window while using the packaged mpv runtime.
- Fixed native child-window attachment by binding the HWND in the command path instead of creating it on a short-lived blocking worker thread.
- Updated the real command verifier to capture rendered-frame evidence with subtitles/render output enabled, then analyze and remove the temporary frame file.

## Verification
- `npm.cmd run tauri:build`
- Real-account `tauri-release` + `HILLS_REAL_COMMAND_ONLY=1` verification against `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`.
- Follow-up process table check for `emby-player.exe` and `mpv.exe`.

## Result
- `ok: true`
- `failures: []`
- Real Emby detection/login/media/PlaybackInfo completed.
- Playback selected `DirectPlay`.
- Bundled mpv IPC embedded playback reached attach, show, load start, and load complete.
- Player state reported video codec and both video params and video output params.
- Frame evidence passed: screenshot size `1440x1080`, aspect `1.3333`, content aspect `1.3349`, bright ratio `0.8971`, colorful ratio `0.6217`, meaningful ratio `0.5327`, `pixelOk: true`.
- Bottom controls remained visible and in-viewport, and pause/resume/seek forward/seek backward all passed.
- `mpvProcessCount` was `0`; a follow-up process table check found no residual `emby-player.exe` or `mpv.exe`.

## Next
- Commit and push this playback fix, then continue remaining UI/layout issues with real-account validation.
