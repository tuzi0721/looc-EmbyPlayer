# 2026-06-03 21:22 - Release build with stop-priority cleanup

## Changed
- Rebuilt the packaged Tauri release after making local playback stop before asynchronous server stop reporting.

## Verified
- `npm.cmd run tauri:build`
- Tauri package integrity confirmed 7 bundled mpv files in `src-tauri\target\release\resources\mpv`.
- Latest executable: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`, timestamp `2026/6/3 21:22:35`, size `8,592,896` bytes.

## Next
- Run real-account command-only validation against this packaged executable.
