# 2026-06-02 12:18 Electron mpv Overlay Default

## Scope

- Changed the Electron player default away from Chromium HTML video for desktop playback.
- Electron now treats desktop playback like an embedded/local player path and uses the bundled mpv runtime by default.
- The previous native `--wid` host is now opt-in only through `HILLS_ELECTRON_MPV_WID=1`; the default path uses an overlay mpv window managed by the Electron backend.

## Why

- The real account smoke selected a direct-play/direct-stream MKV source.
- Chromium HTML video returned media error code 4 for that source, so it could not provide decoded dimensions, duration, seek behavior, or a visible frame.
- The user-facing failure should be described as playback not actually opening successfully, not as a simple aspect-ratio defect.

## Verification

- `node --check electron\main.mjs`
- `node --check scripts\smoke-electron-embedded-local.mjs`
- `node --check scripts\real-server-visual-smoke.mjs`
- `npm.cmd run build`
- `node scripts\smoke-electron-embedded-local.mjs`

## Next

- Re-run the real account visual smoke on the new default Electron overlay mpv path.
- Keep failures split by stage: home compact layout, search result routing, player open/visible pixels, seek-back, resize/fullscreen, and cleanup.
