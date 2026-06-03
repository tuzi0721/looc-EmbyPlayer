# 2026-06-03 21:48 - Release build with screenshot fallback

## Changed
- Rebuilt the packaged Tauri release after adding mpv screenshot fallback from `subtitles` mode to `video` mode.

## Verified
- `npm.cmd run tauri:build`
- Tauri package integrity confirmed 7 bundled mpv files in `src-tauri\target\release\resources\mpv`.
- Latest executable: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`, timestamp `2026/6/3 21:48:22`, size `8,594,432` bytes.

## Next
- Run real-account command-only validation against this packaged executable.
