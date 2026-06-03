# 2026-06-03 22:17 - Personal smoke assertion fix

## What changed

- Fixed the `HILLS_REAL_PERSONAL_ONLY=1` assertion that checked whether a search term was present.
- The real-run summary stores this as `backend.searchTermPresent`, not `backend.search.searchTermPresent`.

## Why

The real isolated run produced the expected product evidence but failed on the verifier's own field path:

- Account count was isolated to 2.
- All-account media/search results were annotated with two account/server sources.
- Same-name results across sources were preserved.
- Aggregate UI search rendered sourced cards and clicking one opened an item route with `server/account` query context.

## Verification

- `node --check scripts\real-server-visual-smoke.mjs`
- `git diff --check`

## Next

- Rerun the real personal-media guard and require a formal `ok: true`.
