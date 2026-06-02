# 2026-06-02 15:26 Detail Compact Title Visual Pass

## Scope
- Fixed compact detail-page hero layout so long titles are not pushed above the viewport in low-height or narrow desktop windows.
- Added real visual smoke metrics for `.detail .hero__title`.
- Added failures when detail or series detail titles are missing or clipped outside the viewport.

## Changes
- `src/views/DetailView.vue`
  - Adds compact hero body bounds for `max-width: 1100px` or `max-height: 700px`.
  - Reduces title, action, tag, metadata, and playback-panel spacing in compact windows.
  - Keeps a scroll fallback for very low-height windows instead of letting the title clip at the top.
- `scripts/real-server-visual-smoke.mjs`
  - Captures `detailTitle` and `detailTitleClipped`.
  - Fails detail and series-detail inspections if the title leaves the viewport.

## Verification
- `node --check scripts\real-server-visual-smoke.mjs`
- `npm.cmd run build`
- `node scripts\smoke-electron-home-hero.mjs`
- `node scripts\real-server-visual-smoke.mjs`
- Manual screenshot review of retained real artifacts under `C:\Users\Sakur\AppData\Local\Temp\hills-lite-real-visual-1780385078873\screenshots`

## Result
- Local Electron smoke returned `ok: true`.
- Real-server visual smoke returned `ok: true` and `failures: []`.
- Real `detail-960x600.png` and `detail-760x430.png` now show the long title fully inside the viewport.
- Real `series-detail-960x600.png` remained readable with no clipped title.
- Home compact screenshots still keep the fixed hero ratio and expose the continue-watching row.
- Playback still waits for visual readiness, waits another 5 seconds, captures the player screenshot, verifies seek-back/fullscreen/resizes, and exits with zero remaining Electron/mpv child processes.

## Notes
- The run did not generate `player-native-host.png`; no desktop or unrelated native-window screenshot is accepted as evidence.
- No credentials, tokens, complete server URLs, or playback URLs are recorded in this log.
