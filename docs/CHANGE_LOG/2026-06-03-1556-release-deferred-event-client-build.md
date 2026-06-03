# 2026-06-03 15:56 - release build with deferred event client

## Scope

- Rebuilt the packaged Tauri release after deferring embedded mpv event-client setup.
- Kept package integrity checks in the build chain.

## Verification

- `npm.cmd run tauri:build`
- `npm.cmd run check:tauri-package`

## Result

- Latest exe: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Timestamp: `2026/6/3 15:55:59`
- Size: `8,526,848` bytes
- Package integrity check passed with frontend dist and bundled mpv runtime present.

## Next

- Run real-account command-only verification against this exact release exe, without screenshots.
