# 2026-06-03 10:49 - Tauri IPC embedded window failed

## Evidence

- Reran the real-account Tauri release visual smoke against the `10:22` release.
- Setup reached the real server and loaded account media: `viewCount=5`, `resumeCount=3`, `heroCount=36`, `mediaSourceCount=2`.
- Multi-size screenshots completed for home, detail, and series detail.
- Personal routes and search completed.
- Series detail click opened the player route.

## Failure

- The user observed a separate mpv-style top-level window showing `Drop files or URLs to play here`.
- That window was idle and did not receive the playback URL.
- The app appeared unresponsive from the user's side.
- The smoke runner later failed with `Runtime.evaluate timeout` after `player-open-wait-complete`.
- The temp credential input file was deleted after the script read it.
- After manual close, no matching `emby-player.exe`, `mpv.exe`, or smoke runner process remained.

## Result

This is not a playback visual pass. Routing the Tauri `Embedded` backend through bundled `mpv.exe` IPC avoided the earlier libmpv attach hang, but it still produced the wrong user-visible behavior: an independent idle mpv window instead of reliable in-app playback. This IPC fallback direction must be reverted or removed from the Tauri embedded path.
