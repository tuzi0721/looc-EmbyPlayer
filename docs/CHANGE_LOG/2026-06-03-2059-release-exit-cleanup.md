# 2026-06-03 20:59 - Release build with exit cleanup hardening

## Changed
- Rebuilt the packaged Tauri release after hardening playback shutdown and command-only cleanup gates.

## Verified
- `npm.cmd run tauri:build`
- Tauri package integrity confirmed 7 bundled mpv files in `src-tauri\target\release\resources\mpv`.
- Latest executable: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`, timestamp `2026/6/3 20:59:51`, size `8,592,896` bytes.

## Next
- Run the real-account command-only playback verifier against this packaged executable and require cleanup `stop/hide/detach` success.
