# 2026-06-03 16:05 - release build with playback info diagnostics

## Scope

- Rebuilt the packaged Tauri release after adding `play` PlaybackInfo diagnostics.
- Kept package integrity checks in the build chain.

## Verification

- `npm.cmd run tauri:build`
- `npm.cmd run check:tauri-package`

## Result

- Latest exe: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Timestamp: `2026/6/3 16:04:46`
- Size: `8,528,384` bytes
- Package integrity check passed with frontend dist and bundled mpv runtime present.

## Next

- Run real-account command-only verification against this exact release exe, without screenshots.
