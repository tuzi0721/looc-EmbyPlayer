# 2026-06-03 19:31 - Release with Tauri notification clear persistence

## Changed
- Rebuilt the packaged Tauri release after adding cleared-notification source-key persistence to the Tauri notification path.

## Verification
- `npm.cmd run tauri:build` passed.
- The build included frontend production build, local-decode guard, no-planned-ui guard, TypeScript check, Vite build, release executable build, and Tauri package integrity check.
- Package integrity confirmed 7 bundled mpv files copied to `src-tauri\target\release\resources\mpv`.

## Artifact
- Latest exe: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Timestamp: `2026/6/3 19:31:40`
- Size: `8,594,944` bytes

## Next
- Continue remaining real UI/playback issues against this packaged baseline.
