# 2026-06-04 00:07 - Release Download Endpoint Priority

## Summary
- Rebuilt the packaged Tauri release after adding DirectPlay download-endpoint priority.
- This release should try `Items/{id}/Download` before stream endpoints for safe DirectPlay media sources.

## Verification
- `npm.cmd run tauri:build`
- Frontend production build passed.
- Tauri release build passed.
- Package integrity passed with 7 bundled mpv files copied to `src-tauri\target\release\resources\mpv`.

## Artifact
- `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Size: `8,612,352` bytes
- Last write time observed: `2026/6/4 00:07:11`

## Next
- Rerun the real-account command-only playback guard and check whether the download endpoint honors Range and lets mpv become video-ready.
