# 2026-06-03 16:53 - release build with embedded network compatibility

## Scope

- Rebuilt the packaged Tauri release after adding embedded mpv network compatibility settings.
- Kept package integrity checks in the build chain.

## Verification

- `npm.cmd run tauri:build`
- `npm.cmd run check:tauri-package`

## Result

- Latest exe: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Timestamp: `2026/6/3 16:52:46`
- Size: `8,539,136` bytes
- Package integrity check passed with frontend dist and bundled mpv runtime present.

## Next

- Run real-account command-only verification against this exact release exe, without screenshots.
