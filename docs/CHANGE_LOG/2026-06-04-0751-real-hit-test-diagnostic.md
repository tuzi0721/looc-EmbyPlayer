# 2026-06-04 07:51 - Real hit-test diagnostic

## What changed

- Added `HILLS_REAL_HIT_TEST_ONLY=1` to `scripts\real-server-visual-smoke.mjs`.
- The mode launches the real Tauri release, logs into the real server, opens the selected movie and series detail pages, and reports play-button rectangles plus `elementsFromPoint` stacks without starting playback.
- Improved full-smoke play-button hit reporting so a click is considered valid when the hit target is the play button or a child inside `.hero__play`, instead of requiring the raw hit tag to be exactly `BUTTON`.

## Verification

- `node --check scripts\real-server-visual-smoke.mjs`
- `npm.cmd run build`
- `git diff --check`
- `npm.cmd run tauri:build`
- Real-account Tauri release hit-test-only smoke:
  - `ok=true`, `failures=[]`
  - line 2 detected healthy Emby; line 1 reported down
  - selected movie item `21648`
  - selected series item `34743`
  - movie and series play buttons had center, left-inside, and right-inside points all hitting `BUTTON.hero__play`
  - follow-up process check found no `emby-player` or `mpv`
  - reported temp artifact directory no longer existed

## Note

An earlier attempted CSS change that made `.hero` non-interactive was proven wrong by a full smoke rerun and was not kept. The product CSS is unchanged in this phase.

## Next

- Continue with the remaining full-smoke failures: `/history` and `/aggregate` image loading, selected-item search miss, late/black initial player readiness, and normal runtime cleanup.
