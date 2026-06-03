# 2026-06-03 18:09 - release after exit and embed startup fixes

## Context

- Rebuilt the packaged Tauri release after the latest fixes:
  - Electron window close now waits for runtime cleanup.
  - PlayerView no longer blocks the real playback request on embedded host setup.

## Verification

- `npm.cmd run tauri:build`
- The build ran the frontend `npm run build`, including `check:local-decode` and `check:no-planned-ui`.
- `scripts/check-tauri-package.mjs` passed.

## Artifact

- Latest exe: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Timestamp: `2026/6/3 18:09:19`
- Size: `8,584,704` bytes

## Next

- Continue remaining playback output/UI issues against this release baseline.
