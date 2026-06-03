# 2026-06-03 17:06 release local proxy build

## Built
- Rebuilt the packaged Tauri release with the local stream proxy included.
- Latest exe: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Timestamp: `2026/6/3 17:06:21`
- Size: `8,582,144` bytes

## Verification
- Passed: `npm.cmd run build`
- Passed: `node --check scripts\real-server-visual-smoke.mjs`
- Passed: `npm.cmd run tauri:build`
- Passed package integrity check: release executable, frontend dist, and 7 bundled mpv files are present.
- No screenshots were used.

## Notes
- A read-only process inspection attempt was denied by Windows permission while the build was still running, but the build completed normally afterward.

## Next
- Run the real-account command-only smoke against this exact release exe.
- Confirm whether embedded mpv moves past the prior `Raw(-13)` remote URL load failure when fed through the local proxy.
