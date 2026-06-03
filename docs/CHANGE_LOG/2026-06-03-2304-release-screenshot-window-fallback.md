# 2026-06-03 23:04 - Release Screenshot Window Fallback

## Summary
- Rebuilt the packaged Tauri release after adding the mpv `window` screenshot fallback.
- The release executable changed size, confirming the Rust playback backend changes were included.

## Verification
- `npm.cmd run tauri:build`
  - Frontend production build passed.
  - Local decode guard passed.
  - No planned UI guard passed.
  - Tauri release build passed.
  - Package integrity passed with 7 bundled mpv files copied to `src-tauri\target\release\resources\mpv`.
- Latest exe: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`.
- Size: `8,594,944` bytes.

## Next
- Rerun the real-account command-only playback guard against this rebuilt exe.
