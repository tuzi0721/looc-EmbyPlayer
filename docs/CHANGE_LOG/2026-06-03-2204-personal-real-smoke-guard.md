# 2026-06-03 22:04 - Personal media real-account smoke guard

## What changed

- Added `HILLS_REAL_PERSONAL_ONLY=1` to `scripts/real-server-visual-smoke.mjs`.
- The new path logs into the real account twice by treating line 2 as a second independent server configuration, then checks all-account media/search source annotations and the real Aggregate UI search click route.
- The check is command-only: no screenshots and no playback startup.

## Why

The previous command-only smoke focused on playback. It could not prove that multi-server favorites, history, aggregate search, and source-preserving navigation worked.

## Verification

- `node --check scripts\real-server-visual-smoke.mjs`
- `npm.cmd run build`
- `git diff --check`

## Next

- Run `HILLS_REAL_PERSONAL_ONLY=1` against the packaged Tauri exe with the real test account and treat failures as product bugs, not as a pass.
