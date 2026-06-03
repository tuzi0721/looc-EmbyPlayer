# 2026-06-03 15:27 Lazy embedded release rebuild

## What changed

- Rebuilt the Tauri release after changing embedded mpv to lazy initialization.

## Verification

- `npm.cmd run tauri:build`
- `npm.cmd run check:tauri-package`

## Artifact evidence

- `src-tauri\target\release\emby-player.exe`: `8,532,480` bytes, timestamp `2026/6/3 15:20:19`.
- Tauri package check passed with frontend dist and bundled mpv runtime present.

## Next

- Rerun real-account command-only validation without screenshots.
- Expected first milestone: bridge/router should load before playback attempts lazy libmpv creation.
