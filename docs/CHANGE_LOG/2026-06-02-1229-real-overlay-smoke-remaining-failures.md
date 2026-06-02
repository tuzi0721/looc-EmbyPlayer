# 2026-06-02 12:29 Real Overlay Smoke Remaining Failures

## Scope

- Re-ran the real account visual smoke on the current default Electron playback path.
- Used the real Emby line selected by detection and kept credentials/URLs out of the log.

## Findings

- Real login, media libraries, resume items, hero candidates, and two media source candidates loaded.
- Detail pages opened across 1920x1080, 1366x768, 1024x768, 960x600, and 760x430.
- Player route opened on the real MKV source through bundled mpv, not HTML video.
- The player exposed duration, playback position, tracks, H.264/AAC codec data, D3D11 video params, progress controls, fullscreen controls, and visible video pixels.
- Runtime cleanup passed; Electron exited and no playback child process remained.

## Remaining Failures

- Home 760x430 compact hero aspect measured about 3.08, outside the intended fixed-ratio range.
- Search did not return the selected real item.
- Seek-back verification did not observe playback time moving backward.

## Verification

- `node scripts\real-server-visual-smoke.mjs` with real credentials supplied through environment variables and output desensitized.

## Next

- Fix the compact home hero ratio first.
- Inspect the real search path so selected real items can be found by search.
- Inspect the mpv seek-back command/measurement path and make the runtime behavior verifiable.
