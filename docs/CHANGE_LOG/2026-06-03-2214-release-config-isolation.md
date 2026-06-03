# 2026-06-03 22:14 - Release with smoke config isolation

## What changed

- Rebuilt the packaged Tauri release after adding the smoke-only `HILLS_CONFIG_STORE_PATH` config-store override and the personal-media guard.

## Verification

- `npm.cmd run tauri:build`
  - Frontend production build passed.
  - Tauri release build passed.
  - Package integrity check passed with 7 bundled mpv files.
- `git diff --check`

## Artifact

- `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Last write time: `2026/6/3 22:14:07`
- Size: `8,594,432` bytes

## Next

- Rerun `HILLS_REAL_PERSONAL_ONLY=1` against this release executable.
