# 2026-06-03 15:38 - release build with bounded embed attach

## Scope

- Rebuilt the packaged Tauri release after bounding `embed_attach`.
- Kept the package validator in the build chain so stale/wrong executables and missing frontend assets are rejected.

## Verification

- `npm.cmd run tauri:build`
- `npm.cmd run check:tauri-package`

## Result

- Latest exe: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Timestamp: `2026/6/3 15:38:04`
- Size: `8,535,552` bytes
- Same-directory runtime DLLs are present: `libmpv-2.dll`, `d3dcompiler_43.dll`, `emby_player_lib.dll`.

## Next

- Run real-account command-only verification against this exact release exe, without screenshots.
