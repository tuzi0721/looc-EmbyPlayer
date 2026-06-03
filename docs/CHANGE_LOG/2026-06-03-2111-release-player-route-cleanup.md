# 2026-06-03 21:11 - Release build with player route cleanup

## Changed
- Rebuilt the packaged Tauri release after PlayerView unmount cleanup and the route-away command-only verifier were updated.

## Verified
- `npm.cmd run tauri:build`
- Tauri package integrity confirmed 7 bundled mpv files in `src-tauri\target\release\resources\mpv`.
- Latest executable: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`, timestamp `2026/6/3 21:11:08`, size `8,592,896` bytes.

## Next
- Run the real-account command-only verifier against this packaged executable.
