# 2026-06-02 10:46 Electron HTML playback default restored

## Scope
- Responded to the rejected visual evidence where native mpv `wid` screenshots leaked desktop or other-window content.
- Restored Electron's default player path to the in-app HTML video direct-stream renderer.
- Kept native mpv embedding available only for explicit debug via `?nativeMpv=1`; Tauri still keeps its native mpv path.
- No credentials, tokens, full server URLs, playback URLs, or local screenshot artifact paths are recorded here.

## Changes
- `PlayerView` now treats Electron desktop playback as HTML video by default instead of enabling native mpv embedding whenever the Electron bridge exists.
- The embedded local playback smoke now asserts that the default Electron route creates exactly one HTML video and no native embed state at playback start.
- The native mpv `wid` path remains rejected as a default path until it can produce clean user-visible windowed screenshots without black frames or desktop leakage.

## Validation
- `node --check scripts\smoke-electron-embedded-local.mjs` passed.
- `node --check electron\main.mjs` passed.
- `node --check electron\backend\mpv.mjs` passed.
- Local Electron playback smoke passed with `mode=html`, `htmlVideoCount=1`, no native embed state at start, working seek-back, fullscreen, resize, compact layout, runtime cleanup, and local-decode contract.
- Manual visual inspection of the retained initial, fullscreen, resized, and compact playback screenshots showed the in-app test video and controls only; no desktop or other-window content was accepted as evidence.

## Next
- Run the Vue/build gate for the `.vue` edit.
- Refresh the packaged Electron output after the verified source fix.
- Continue real-account, real-server visual inspection across multiple window sizes; this local smoke does not replace the required real-server pass.
