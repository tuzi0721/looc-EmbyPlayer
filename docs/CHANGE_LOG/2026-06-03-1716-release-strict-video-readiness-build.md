# 2026-06-03 17:16 release strict video readiness build

## Built
- Rebuilt the packaged Tauri release after tightening embedded mpv video readiness diagnostics and command-only smoke criteria.
- Latest exe: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Timestamp: `2026/6/3 17:15:59`
- Size: `8,582,656` bytes

## Verification
- Passed: `npm.cmd run tauri:build`
- Passed package integrity check: release executable, frontend dist, and 7 bundled mpv files are present.
- No screenshots were used.

## Next
- Run real-account command-only smoke against this exact release exe with the stricter video readiness criteria.
