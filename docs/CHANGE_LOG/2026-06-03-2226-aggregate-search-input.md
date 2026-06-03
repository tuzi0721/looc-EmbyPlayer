# 2026-06-03 22:26 - Aggregate search input value handling

## What changed

- Updated Aggregate search input handling so `onSearchInput` reads the actual input event value and syncs it into `searchTerm` before scheduling all-account search.

## Why

The stronger real personal-media guard showed that backend all-account search worked, but the Aggregate UI search rendered no result cards. The handler previously assumed `v-model` had already updated `searchTerm` before the custom `@input` handler ran.

## Verification

- `npm.cmd run build`
- `node --check scripts\real-server-visual-smoke.mjs`
- `git diff --check`

## Next

- Rebuild the packaged release and rerun the real personal-media guard.
