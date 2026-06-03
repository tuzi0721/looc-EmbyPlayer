# 2026-06-03 19:43 - Real command pass for 19:40 release

## Verification
- Ran `scripts\real-server-visual-smoke.mjs` in `tauri-release` + `HILLS_REAL_COMMAND_ONLY=1` mode against the latest release exe.
- Used the provided real test account through a temporary input file; no screenshots were taken.

## Result
- `ok: true`
- `failures: []`
- Server detection completed as Emby.
- Login completed and selected a healthy real line.
- Views, resume items, hero candidates, media list, series list, and PlaybackInfo all loaded.
- Playback selected `DirectPlay`.
- Embedded playback reached attach, backend load, and load completion.
- Player controls passed: pause, resume, seek forward, seek backward.
- Cleanup passed: stop, hide, detach.
- Independent `mpv.exe` process count was `0`.
- Follow-up process table check found no residual `emby-player.exe` or `mpv.exe`.

## Next
- Continue remaining user-visible layout/playback issues. The command-only pass validates the backend/player control chain, but it does not replace multi-size visual inspection for layout quality.
