# 2026-06-03 18:32 release: native menu removed

## Changed

- Rebuilt the packaged Tauri release after removing the native Tauri menu path.
- Latest release executable:
  - `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
  - timestamp: `2026/6/3 18:32:29`
  - size: `8,589,312` bytes

## Verification

- `npm.cmd run tauri:build`
  - frontend build passed
  - local-decode guard passed
  - no-planned-ui guard passed
  - release executable built
  - Tauri package integrity check passed with bundled mpv resources present

## Next

- Continue investigating the reported startup hang where opening the app immediately becomes unresponsive and no backend requests are observed.
