# 2026-06-03 07:59 Tauri real mpv top-window fail

## Context

- The Tauri release real-server visual smoke was rerun with the temp input-file mode.
- The temp credential file was deleted after the script read it.
- The smoke reached the real server, loaded account media, opened real detail pages, and entered the player route.

## Evidence

- The preserved smoke log is `C:\Users\Sakur\AppData\Local\Temp\hills-real-smoke-output-e7f4a43397be8168ae871dfa.log`.
- The preserved artifact directory is `C:\Users\Sakur\AppData\Local\Temp\hills-lite-real-visual-1780444491848`.
- App diagnostics recorded `play:start`, `play:playback-info`, `play:mpv-load-start`, `play:mpv-load-complete`, and `play:return`.
- Playback still did not become ready: duration, track count, and video params stayed empty.
- The visible failure is a separate top-level mpv window showing "Drop files or URLs to play here", not an embedded player surface.
- The user confirmed that top-level mpv window was closed manually.
- The smoke also reported cleanup failure while the app was still running, so exit cleanup remains part of the same blocker.

## Verification

- Real-server visual smoke failed as expected for this defect; no pass was claimed.
- A narrow process check after the manually closed window found no remaining `emby-player.exe` or `mpv.exe` from that run.

## Next

- Inspect the Tauri embedded mpv backend and fix the native window binding/load path so mpv does not create an independent top-level window.
- Ensure app/player exit destroys the mpv instance and leaves no playback process behind.
