# 2026-06-03 23:15 - Release Tauri Embed State

## Summary
- Rebuilt the packaged Tauri release after adding the `get_embed_state` command and Tauri embedded host hwnd reporting.

## Verification
- `npm.cmd run tauri:build`
  - Frontend production build passed.
  - Local decode guard passed.
  - No planned UI guard passed.
  - Tauri release build passed.
  - Package integrity passed with 7 bundled mpv files copied to `src-tauri\target\release\resources\mpv`.
- Latest exe: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`.
- Size: `8,597,504` bytes.

## Next
- Rerun the real-account command-only playback guard against this rebuilt exe.
