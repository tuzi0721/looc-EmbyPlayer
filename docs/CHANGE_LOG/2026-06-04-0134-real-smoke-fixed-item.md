# 2026-06-04 01:34 - Real Smoke Fixed Item

## Summary
- Added optional fixed-item selection to `scripts\real-server-visual-smoke.mjs`.
- The script now accepts `HILLS_REAL_ITEM_ID` or a fifth input-file line.
- If the item is not in the sampled home/media candidates, the smoke still uses the requested id for PlaybackInfo and the player route.

## Why
- The real command-only smoke sampled MKV item `21648` while the active investigation needed to retest MP4 item `34535`.
- Fixed item support keeps real-account validation on the exact media class under repair.

## Verification
- `node --check scripts\real-server-visual-smoke.mjs`
- `git diff --check`

## Next
- Rebuild the release with the Range probe error guard.
- Rerun real-account command-only validation with item `34535` pinned.
