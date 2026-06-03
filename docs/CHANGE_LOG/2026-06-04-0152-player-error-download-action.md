# 2026-06-04 01:52 - Player Error Download Action

## Summary
- Added a user-visible download-to-local action to the player error state for remote Emby/Jellyfin items.
- This gives Range-broken MP4/direct-stream failures a real local-decode path instead of only retry/copy/back.

## Changed
- `PlayerView.vue` now wires the downloads store into the player.
- The player distinguishes remote library items from local files, local download playback, WebDAV/Alist, and direct URL playback before showing the download action.
- Clicking `下载到本地` switches to the route account when needed, starts a direct-preferred download task, and routes to `/downloads?task=<id>` so the task is highlighted.
- Existing completed-download playback remains the final local playback path through `play_local`.

## Verification
- `npm.cmd run build`
- `git diff --check`

## Next
- Commit and push this phase, then continue the next visible playback/layout issue without leaving the change local-only.
