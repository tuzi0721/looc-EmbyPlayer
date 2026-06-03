# 2026-06-04 01:27 - Release Range Broken MP4 Clear Block

## Summary
- Rebuilt the packaged Tauri release after adding the Range-broken MP4/M4V/MOV clear-block guard.
- This is a build/package pass only; real-account behavior still needs validation against the packaged exe.

## Verification
- `npm.cmd run tauri:build`
- Frontend production build passed.
- Tauri release build passed.
- Package integrity passed with 7 bundled mpv files copied to `src-tauri\target\release\resources\mpv`.

## Artifact
- `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Size: `8,620,032` bytes
- Last write time observed: `2026/6/4 01:26:59`

## Next
- Rerun the real-account command-only guard and confirm the sampled Range-broken MP4 fails clearly before mpv load, with no external mpv window and no residual process.
