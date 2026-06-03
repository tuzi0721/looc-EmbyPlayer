# 2026-06-03 22:49 - Release Embedded Cleanup

## Summary
- Rebuilt the packaged Tauri release after the embedded playback cleanup timeout fix.
- The rebuilt executable includes the PlayerView direct-detach cleanup path and the command-only verifier native-window evidence fallback.

## Verification
- `npm.cmd run tauri:build`
  - Frontend production build passed.
  - Local decode guard passed.
  - No planned UI guard passed.
  - Tauri release build passed.
  - Package integrity passed with 7 bundled mpv files copied to `src-tauri\target\release\resources\mpv`.
- Latest exe: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`.
- Size: `8,594,432` bytes.

## Next
- Run the real-account command-only playback guard against this rebuilt exe and require cleanup detach plus no residual `mpv.exe`.
