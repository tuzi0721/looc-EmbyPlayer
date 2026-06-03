# 2026-06-03 20:03 - Real layout pass for compact home hero

## Verification
- Ran real-account `tauri-release` + `HILLS_REAL_LAYOUT_METRICS=1` verification against the `19:59:40` release exe.
- Used the native Win32 resize metrics path with no screenshots.

## Result
- `ok: true`
- `failures: []`
- Native window samples covered `1920x1080`, `1366x768`, `1024x768`, `960x600`, and `760x430`.
- Home/detail/series-detail metrics reported no horizontal overflow.
- At `760x430`, home hero measured `670x223` with aspect `3.0`, and the media-library row exposure improved from the prior `6px` sample to `31px`.
- Follow-up process table check found no residual `emby-player.exe` or `mpv.exe`.

## Next
- Continue remaining user-visible layout and playback UI issues.
