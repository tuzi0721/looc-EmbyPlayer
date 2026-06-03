# 2026-06-03 21:51 - Real command cleanup pass

## Verified
- Ran real-account `tauri-release` + `HILLS_REAL_COMMAND_ONLY=1` against `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`.
- Result: `ok: true`, `failures: []`.
- Real server detection/login/media loading succeeded; PlaybackInfo selected `DirectPlay` with `supportsTranscoding: false`.
- Player route mounted, bottom controls were visible, pause/resume/seek forward/seek backward all passed.
- Real mpv screenshot evidence passed with frame `1440x1080`, aspect `1.3333`, content aspect `1.3349`, bright ratio `0.8625`, colorful ratio `0.7852`, meaningful ratio `0.7417`, and `pixelOk: true`.
- Route-away cleanup passed: embedded host hide logged, embedded detach completed, PlayerView unmounted, `mpvProcessCount` was `0`.
- Follow-up process check found no residual `emby-player` or `mpv` process.

## Next
- Commit and push the exit cleanup / screenshot fallback phase, then continue the remaining UI and multi-server issues.
