# 2026-06-03 18:24 - release portrait cards and native fullscreen

## Context

- Rebuilt the packaged Tauri release after:
  - personal-media portrait card UI changes,
  - missing Tauri native fullscreen command.

## Verification

- `npm.cmd run tauri:build`
- The build ran frontend `npm run build`, including `check:local-decode` and `check:no-planned-ui`.
- Tauri package integrity check passed.

## Artifact

- Latest exe: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Timestamp: `2026/6/3 18:23:59`
- Size: `8,588,288` bytes

## Next

- Continue remaining menu/layout issues and decide whether the native menu bar needs an explicit Tauri-level removal.
