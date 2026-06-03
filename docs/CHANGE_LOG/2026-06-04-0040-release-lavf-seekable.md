# 2026-06-04 00:40 - Release Lavf Seekable

## Summary
- Rebuilt the packaged Tauri release after replacing the invalid `http-seekable` property with per-file lavf `seekable=0` loading for Range-broken streams.
- This is a build pass only; real playback still needs command-only validation against the provided test account.

## Verification
- `npm.cmd run tauri:build`
- Frontend production build passed.
- Tauri release build passed.
- Package integrity passed with 7 bundled mpv files copied to `src-tauri\target\release\resources\mpv`.

## Artifact
- `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Size: `8,614,912` bytes
- Last write time observed: `2026/6/4 00:40:15`

## Next
- Rerun the real-account command-only playback guard and require mpv to reach real loaded video state.
