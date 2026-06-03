# 2026-06-03 10:15 - Tauri real smoke embed attach hang

## Evidence

- Reran the real-account Tauri release visual smoke against `src-tauri\target\release\emby-player.exe`.
- Setup reached the real server and loaded account media: `viewCount=5`, `resumeCount=3`, `heroCount=36`, `mediaSourceCount=2`.
- Multi-size screenshots completed for home, detail, and series detail at `1920x1080`, `1366x768`, `1024x768`, `960x600`, and `760x430`.
- Personal routes and search completed before playback.
- The run stopped after `series-play-from-detail-start`; the app was manually closed, leaving only the smoke runner waiting on a closed app.
- The temp credential input file was deleted after the script read it.

## Diagnostics

- Preserved smoke output: `C:\Users\Sakur\AppData\Local\Temp\hills-real-smoke-output-a6c74ea06b568c52.log`
- Preserved artifacts: `C:\Users\Sakur\AppData\Local\Temp\hills-lite-real-visual-1780452617759`
- App diagnostics reached:
  - `player embed_attach:start`
  - `player embed_attach:parent-ready`
- App diagnostics did not reach:
  - `player embed_attach:complete`
  - `player embed_attach:error`
  - `player play:start`

## Result

This is not a visual playback pass. The current failure is now narrowed to the Tauri embedded attach path hanging after the parent window is resolved and before playback starts. The stuck smoke runner was terminated after confirming no `emby-player.exe` or `mpv.exe` process remained.
