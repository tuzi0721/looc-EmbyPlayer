# 2026-06-03 23:47 - Release Container Stream URL

## Summary
- Rebuilt the packaged Tauri release after switching safe media sources to container-qualified static stream URLs.
- This phase only refreshes the executable; playback still requires real-account validation.

## Verification
- `npm.cmd run tauri:build`
- Frontend production build passed.
- Tauri release build passed.
- Package integrity passed with 7 bundled mpv files copied to `src-tauri\target\release\resources\mpv`.

## Artifact
- `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Size: `8,611,328` bytes
- Last write time observed: `2026/6/3 23:46:47`

## Next
- Rerun the real-account command-only playback guard and check whether the upstream Range response changes from `200` to `206` and whether mpv reaches video-ready state.
