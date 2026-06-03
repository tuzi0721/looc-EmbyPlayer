# 2026-06-03 22:31 - Release with Aggregate search fix

## What changed

- Rebuilt the packaged Tauri release after fixing Aggregate search input handling.

## Verification

- `npm.cmd run tauri:build`
  - Frontend production build passed.
  - Tauri release build passed.
  - Package integrity check passed with 7 bundled mpv files.
- `git diff --check`

## Artifact

- `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Last write time: `2026/6/3 22:31:45`
- Size: `8,594,432` bytes

## Next

- Rerun the real personal-media guard against this release executable.
