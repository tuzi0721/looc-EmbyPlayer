# 2026-06-03 18:43 release: startup platform timeout

## Changed

- Rebuilt the packaged Tauri release after the startup platform timeout fix.
- Latest release executable:
  - `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
  - timestamp: `2026/6/3 18:43:06`
  - size: `8,589,312` bytes

## Verification

- `npm.cmd run tauri:build`
  - frontend build passed
  - local-decode guard passed
  - no-planned-ui guard passed
  - release executable built
  - Tauri package integrity check passed with bundled mpv resources present

## Next

- Continue startup diagnosis if the new release still opens into an unresponsive state.
