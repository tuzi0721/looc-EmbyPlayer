# Download autoplay local playback (2026-06-04 03:04)

## Goal

- Make the Range-broken playback fallback more direct: when a remote item cannot be safely direct-played without server transcoding, the player should offer a path that downloads the original/direct stream and starts local playback automatically after completion.
- Preserve local decoding only. This change does not enable Emby/Jellyfin server decoding or transcoding.

## Changes

- `src/views/PlayerView.vue`
  - Changed the remote playback error action from `下载到本地` to `下载后播放`.
  - After creating the download task, routes to `/downloads?task=<id>&autoplay=1`.
  - Preserves the current `account` and `server` query context when handing off to downloads.
  - Shows `已创建下载任务，完成后将自动本地播放` so the user is not left guessing what happens next.

- `src/views/DownloadsView.vue`
  - Tracks the highlighted download task from the route query.
  - If `autoplay=1` and the highlighted task reaches `completed`, automatically routes to the local player.
  - Local playback now includes `local`, `account`, and `server` query values so cross-server same-name media stays attached to the task's original account/server context.
  - Shows a compact `完成后播放` badge on the highlighted in-progress task.

## Verification

- `npm.cmd run build`
  - Includes `check:local-decode`; no server-transcoding path was introduced.
  - Includes `check:no-planned-ui`, `vue-tsc --noEmit`, and Vite production build.
- `git diff --check`
- `npm.cmd run tauri:build`
  - Tauri release build completed.
  - Package integrity check passed: 7 bundled mpv files copied to `src-tauri\target\release\resources\mpv`.

## Release artifact

- Latest exe: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Size: `8,627,200` bytes
- Last write time: `2026/6/4 03:04:30`

## Remaining

- This does not make a non-faststart MP4 on a no-Range server seekable in-place. It turns that class into a direct local-decode workflow instead of black playback or a dead-end error.
- Next stage should return to real-account playback validation and pick a Range-capable item for loaded mpv visual/controls verification, while keeping the clear-block path for known broken item `34535`.
