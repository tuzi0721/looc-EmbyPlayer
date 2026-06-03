# 2026-06-03 15:07 Tauri build helper renamed fail

## What happened

- Ran `npm.cmd run tauri:build` after adding Tauri release guards.
- The build completed compilation and reported `Built application at: A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`.
- The strengthened package check failed because `src-tauri\target\release\emby-player.exe` was only `339456` bytes.

## Finding

- The helper binary was still selected by Tauri/Cargo and then renamed to `emby-player.exe` after `mainBinaryName` was set.
- This confirms the previous release validation was unsafe: a wrong helper-sized executable could be presented as the app.

## Next

- Set Cargo `default-run = "emby-player"` so Tauri selects the real app binary, not `electron_mpv_host`.
- Rebuild and require `check-tauri-package` to pass before any real-server command validation.
