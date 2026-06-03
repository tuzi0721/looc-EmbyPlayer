# 2026-06-03 19:40 - Release with player account context

## Changed
- Rebuilt the packaged Tauri release after preserving account/server route context from detail pages into the player.

## Verification
- `npm.cmd run tauri:build` passed.
- The build included frontend production build, local-decode guard, no-planned-ui guard, TypeScript check, Vite build, release executable build, and Tauri package integrity check.
- Package integrity confirmed 7 bundled mpv files copied to `src-tauri\target\release\resources\mpv`.

## Artifact
- Latest exe: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Timestamp: `2026/6/3 19:40:16`
- Size: `8,594,944` bytes

## Next
- Continue remaining real UI/playback issues against this packaged baseline.
