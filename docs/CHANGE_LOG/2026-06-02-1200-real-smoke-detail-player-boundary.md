# 2026-06-02 12:00 Real Smoke Detail/Player Boundary

## Scope

- Added stage-level diagnostics to `scripts/real-server-visual-smoke.mjs` so a real-server visual run can show whether it is blocked at input, Electron launch, setup, detail, search, player open, resize, or cleanup.
- Re-ran the real account visual smoke through Electron with app-contained screenshots and multiple window sizes.

## Findings

- Real server detection and login reached a healthy Emby line.
- Real account library views loaded, and item detail opened across 1920x1080, 1366x768, 1024x768, 960x600, and 760x430.
- The current hard failure is the player path: Electron still routes the selected real MKV source through HTML video, producing Chromium media error code 4. That leaves duration, decoded dimensions, seek-back behavior, and visible playback invalid.
- Runtime cleanup passed for this run; Electron exited without leaving mpv/helper playback children alive.

## Verification

- `node --check scripts\real-server-visual-smoke.mjs`
- `npm.cmd run build`
- `node scripts\real-server-visual-smoke.mjs` with real credentials supplied via environment variables; output was desensitized and did not include tokens, passwords, full server URLs, or playback URLs.

## Next

- Probe the existing native mpv embed path with the same real item, then restore Electron playback selection so browser-compatible formats may use HTML video while MKV and other non-Chromium formats use bundled mpv/local decode.
