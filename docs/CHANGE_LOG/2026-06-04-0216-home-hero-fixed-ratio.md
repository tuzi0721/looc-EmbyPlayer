# 2026-06-04 02:16 - Home Hero Fixed Ratio

## Summary
- Fixed the home hero container so viewport `max-height` rules no longer distort the intended 16:7 ratio.
- Hardened the real layout metrics verifier so it reloads frontend stores before measuring home and does not require a continue-watching row when the real account has no resume items.

## Changed
- `HeroCarousel.vue` now keeps the home hero at a consistent 16:7 ratio across desktop, compact, and short-height breakpoints.
- Removed height caps that could squeeze the hero into inconsistent proportions.
- `real-server-visual-smoke.mjs` layout mode now reloads the Tauri page and waits for `window.hillsLite`, Vue router, account data, and `.hero.hero--cinema` before measuring `/home`.
- Layout assertions now treat the first visible home row as the media-library row when the real account has `resumeCount=0`.

## Verification
- `npm.cmd run build`
- `npm.cmd run tauri:build`
- `node --check scripts\real-server-visual-smoke.mjs`
- `git diff --check`
- Real-account layout metrics:
  - `HILLS_REAL_APP_MODE=tauri-release`
  - `HILLS_REAL_LAYOUT_METRICS=1`
  - Result: `ok=true`, `failures=[]`.
  - Home hero aspect was `2.286` at `1920x1080`, `1366x768`, `1024x768`, `960x600`, and `760x430`.
  - Home had no horizontal overflow and exposed the first media row at every tested size.
  - Movie and series detail layout checks also passed.
- Follow-up process check found no `emby-player` or `mpv` process.
- Temporary account input file was deleted by the smoke script.

## Release Artifact
- `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Size: `8,620,032` bytes.
- Last write: `2026/6/4 02:11:26`.

## Next
- Commit and push this phase, then continue the next visible playback/layout issue.
