# 2026-06-04 11:41 - Light Layout Small Window Visual Pass

## Changed

- `src/views/HomeView.vue`
  - Tightened the ultra-short home layout for `760px`-wide / `480px`-tall class windows.
  - The home hero keeps the fixed `8:3` cinema ratio, but the first media row now uses smaller cards and tighter gaps so the library row is visibly exposed instead of only showing a thin sliver.
- `scripts/real-server-visual-smoke.mjs`
  - Layout metrics mode now captures PNG screenshots for each real viewport size.
  - Layout mode now treats visually blank screenshots as failures.
  - The small-window home check now requires the library row to be visible for `<=800x500` windows, matching the product target instead of letting `760x430` pass with only a few pixels exposed.

## Verification

- Passed:
  - `node --check scripts\real-server-visual-smoke.mjs`
  - `npm.cmd run build`
  - `npm.cmd run tauri:build`
  - `git diff --check`
- Rebuilt release exe:
  - `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
  - Size: `8,700,416` bytes
  - Last write: `2026/6/4 11:36:25`
- Real-account Tauri release light/layout smoke passed:
  - `ok=true`
  - `failures=[]`
  - Server detection succeeded as Emby.
  - Real movie item: `21648`.
  - Real series item: `34743`.
  - Checked home, movie detail, and series detail at `1920x1080`, `1366x768`, `1024x768`, `960x600`, and `760x430`.
  - All checked routes reported no horizontal overflow and nonblank screenshot pixels.
  - Home hero stayed at `8:3` (`2.667`) across checked sizes.
  - `760x430` home improved from the prior `4px` library exposure to `38px`, with continue-watching and media-library content both visibly present.
  - Movie and series detail pages kept the full-bleed hero, hidden app chrome, unclipped title, and below-hero content exposure at small size.
- Manual visual inspection:
  - Inspected the retained real screenshots for `layout-home-760x430.png`, `layout-home-1366x768.png`, `layout-detail-760x430.png`, and `layout-series-detail-760x430.png`.
  - The inspected screenshots used real server images and light theme, not simulated media.

## Cleanup

- Temporary credential input file was removed.
- Retained real-smoke artifact directories were removed after inspection.
- Follow-up process check found no `emby-player.exe`, `mpv.exe`, `cargo.exe`, or `rustc.exe`.

## Next

- Commit and push this phase.
- Continue the remaining user-visible issues, with the next likely target being settings/server add/login UI cleanup or player controls/fullscreen behavior.
