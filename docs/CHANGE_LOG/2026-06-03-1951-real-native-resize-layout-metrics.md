# 2026-06-03 19:51 - Real native resize layout metrics

## Changed
- Improved `scripts\real-server-visual-smoke.mjs` so layout and visual resize checks can resize the real Windows/Tauri app window through Win32 `SetWindowPos`.
- `resizeAndMeasure` and `resizeAndInspect` now report the native window size alongside browser viewport metrics.
- This replaces the previous layout-only limitation where WebView2 ignored scripted `window.resizeTo`, causing all samples to remain at one viewport.

## Verification
- `node --check scripts\real-server-visual-smoke.mjs`
- Ran real-account `tauri-release` + `HILLS_REAL_LAYOUT_METRICS=1` verification against the latest release exe.
- Result: `ok: true`, `failures: []`.
- Native window samples covered `1920x1080`, `1366x768`, `1024x768`, `960x600`, and `760x430`.
- Home/detail/series-detail metrics reported no horizontal overflow.
- Follow-up process table check found no residual `emby-player.exe` or `mpv.exe`.

## Next
- Use this stronger real multi-size metrics path for future visual/layout regressions, then continue fixing remaining user-visible UI/playback issues.
