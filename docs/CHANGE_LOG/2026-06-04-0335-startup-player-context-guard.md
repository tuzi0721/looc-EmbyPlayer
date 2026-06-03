# 2026-06-04 03:35 - Startup Player Context Guard

## Changed

- Native desktop cold start no longer restores an initial `/player/...` URL into the router. If WebView state or a stale deep route points at the player during app launch, the app now starts at `/home` instead of auto-entering playback.
- Remote library playback now waits for account and server context before calling item detail or playback commands. The player refreshes saved servers/accounts, switches to the route account when present, and returns a clear login/server error instead of starting playback with empty context.

## Verification

- `npm.cmd run build`
- `git diff --check`
- `npm.cmd run tauri:build`
- Tauri package integrity passed with 7 bundled mpv files in `src-tauri\target\release\resources\mpv`.
- New release exe: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`, size `8,627,200` bytes, last write time `2026/6/4 03:34:49`.
- Process check after build found no running `emby-player` or `mpv` process.

## Next

- Commit and push this phase, then run the real-account release smoke again from a clean launch path.
