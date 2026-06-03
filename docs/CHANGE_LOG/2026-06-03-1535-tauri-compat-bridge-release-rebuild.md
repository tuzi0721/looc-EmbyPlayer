# 2026-06-03 15:35 Tauri compat bridge release rebuild

## What changed

- Rebuilt Tauri release after adding the Tauri `window.hillsLite` compatibility bridge.

## Verification

- `npm.cmd run tauri:build`
- `npm.cmd run check:tauri-package`

## Artifact evidence

- `src-tauri\target\release\emby-player.exe`: `8,532,480` bytes, timestamp `2026/6/3 15:28:05`.
- Tauri package check passed with frontend dist and bundled mpv runtime present.

## Next

- Rerun real-account command-only validation without screenshots.
- Expected first milestone: `hasBridge:true` and `hasRouter:true`.
