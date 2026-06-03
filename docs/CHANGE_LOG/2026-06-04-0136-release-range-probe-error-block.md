# 2026-06-04 01:36 - Release Range Probe Error Block

## Summary
- Rebuilt the packaged Tauri release after changing Range probe errors to a clear pre-mpv failure.
- This release also includes fixed-item support in the real-account smoke script.

## Verification
- `npm.cmd run tauri:build`
- Frontend production build passed.
- Tauri release build passed.
- Package integrity passed with 7 bundled mpv files copied to `src-tauri\target\release\resources\mpv`.

## Artifact
- `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Size: `8,620,032` bytes
- Last write time observed: `2026/6/4 01:36:21`

## Next
- Rerun real-account command-only validation with MP4 item `34535` pinned.
