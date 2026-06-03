# 2026-06-03 19:22 - Release with light theme surfaces

## Changed
- Rebuilt the packaged Tauri release after the light-theme surface readability fix.

## Verification
- `npm.cmd run tauri:build` passed.
- The build included the frontend production build, local-decode guard, no-planned-ui guard, TypeScript check, Vite build, release executable build, and Tauri package integrity check.
- Package integrity confirmed 7 bundled mpv files copied to `src-tauri\target\release\resources\mpv`.

## Artifact
- Latest exe: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Timestamp: `2026/6/3 19:22:41`
- Size: `8,589,312` bytes

## Next
- Continue the remaining real UI/playback issues against this packaged baseline.
