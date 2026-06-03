# 2026-06-04 00:26 - Release Range Preflight

## Summary
- Rebuilt the packaged Tauri release after adding Range preflight and mpv `http-seekable` override.
- This release should set `http-seekable=no` only when the chosen no-transcode upstream fails the `206 Partial Content` preflight.

## Verification
- `npm.cmd run tauri:build`
- Frontend production build passed.
- Tauri release build passed.
- Package integrity passed with 7 bundled mpv files copied to `src-tauri\target\release\resources\mpv`.

## Artifact
- `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Size: `8,614,912` bytes
- Last write time observed: `2026/6/4 00:26:07`

## Next
- Rerun the real-account command-only playback guard and require either video-ready playback or a clearer non-seekable-stream failure.
