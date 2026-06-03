# 2026-06-03 23:57 - Release Static Stream Priority

## Summary
- Rebuilt the packaged Tauri release after changing static stream URL priority.
- This release should try `Videos/{id}/stream.{container}` before the server-provided `DirectStreamUrl` for safe container media sources.

## Verification
- `npm.cmd run tauri:build`
- Frontend production build passed.
- Tauri release build passed.
- Package integrity passed with 7 bundled mpv files copied to `src-tauri\target\release\resources\mpv`.

## Artifact
- `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Size: `8,611,840` bytes
- Last write time observed: `2026/6/3 23:57:22`

## Next
- Rerun the real-account command-only playback guard and check whether the redacted upstream path no longer uses `original.mp4`, whether Range gets `206`, and whether mpv becomes video-ready.
