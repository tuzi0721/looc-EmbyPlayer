# 2026-06-04 11:48 - Old Electron artifact cleanup

## Changed

- Removed ignored, stale runtime artifacts that could lead to launching the wrong player build:
  - `release-electron/`
  - `.electron-user-data/`
  - `.electron-builder-cache/`
  - `.tmp/`
- Kept the current Tauri release executable:
  - `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`

## Evidence

- The user-provided screenshot still showed a separate black mpv-style window with the idle prompt, so this phase does not claim embedded playback is fixed.
- A process query after the screenshot found no active `emby-player.exe` or `mpv.exe`, so the screenshot could not be tied to a currently running process.
- Repository inspection found an old ignored Electron package at `release-electron\win-unpacked\Hills Lite.exe` with its own bundled `mpv.exe`; that package is now removed to avoid accidental launches of the obsolete build.
- Current release exe remains present at `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`, size `8,700,416` bytes, last write `2026/6/4 11:36:25`.

## Next

- Continue with a current-release playback/window guard that fails if any launched mpv child exposes a visible top-level idle window, even when that window title is also `Hills Lite`.
