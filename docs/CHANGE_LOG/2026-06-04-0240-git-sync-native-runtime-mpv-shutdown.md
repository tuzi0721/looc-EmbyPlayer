# Git sync: native runtime and mpv shutdown guard (2026-06-04 02:40)

## Result

- Committed and pushed the native runtime / mpv shutdown phase to `main`.
- Commit: `e5996f3 Fix native playback runtime and mpv shutdown`.
- Remote updated: `ef10b40..e5996f3`.

## Included

- Shared native runtime detection for playback-facing UI.
- Player page now uses embedded mpv in Tauri release contexts detected by `tauri.localhost`, `tauri:`, or `window.__TAURI_IPC__`.
- Windows `taskkill /T /F` fallback for bundled mpv shutdown timeout.
- Release exe rebuilt and package integrity checked.
- Real-account evidence recorded without credentials or full stream URLs.

## Next

- Continue with the real Range/seek playback failure.
