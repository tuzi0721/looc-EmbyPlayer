# 2026-06-03 21:31 - Release build with detach-first cleanup

## Changed
- Rebuilt the packaged Tauri release after detach-first embedded cleanup and native-window frame capture validation.

## Verified
- `npm.cmd run tauri:build`
- Tauri package integrity confirmed 7 bundled mpv files in `src-tauri\target\release\resources\mpv`.
- Latest executable: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`, timestamp `2026/6/3 21:31:23`, size `8,592,896` bytes.

## Next
- Run real-account command-only validation against this packaged executable.
