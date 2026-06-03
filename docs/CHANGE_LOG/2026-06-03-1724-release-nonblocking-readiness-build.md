# 2026-06-03 17:24 release nonblocking readiness build

## Built
- Rebuilt the packaged Tauri release with non-blocking embedded mpv readiness diagnostics.
- Latest exe: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Timestamp: `2026/6/3 17:24:21`
- Size: `8,584,704` bytes

## Verification
- Passed: `npm.cmd run tauri:build`
- Passed package integrity check: release executable, frontend dist, and 7 bundled mpv files are present.
- No screenshots were used.

## Next
- Run real-account strict command-only smoke against this exact release exe.
