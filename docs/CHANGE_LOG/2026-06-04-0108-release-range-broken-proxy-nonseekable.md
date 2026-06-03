# 2026-06-04 01:08 - Release Range Broken Proxy Nonseekable

## Summary
- Rebuilt the packaged Tauri release after hiding broken upstream Range support from mpv for non-206 direct streams.
- This is a build/package pass only; real playback still needs the real-account command-only guard.

## Verification
- `npm.cmd run tauri:build`
- Frontend production build passed.
- Tauri release build passed.
- Package integrity passed with 7 bundled mpv files copied to `src-tauri\target\release\resources\mpv`.

## Artifact
- `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Size: `8,615,936` bytes
- Last write time observed: `2026/6/4 01:07:52`

## Next
- Rerun the real-account command-only playback guard against this packaged release.
- Require no external mpv top-level window, no residual app/mpv process, and real mpv readiness evidence.
