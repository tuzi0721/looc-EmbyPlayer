# 2026-06-03 22:23 - Personal route content guard

## What changed

- Tightened `HILLS_REAL_PERSONAL_ONLY=1` route checks.
- Favorites/History/Aggregate route sampling now waits up to 8 seconds instead of taking a fixed 1.4 second snapshot.
- When backend resume content exists, History and Aggregate must render visible personal-media cards and source labels.

## Why

The previous real run proved all-account backend/search/source navigation but still reported zero route cards for Favorites/History/Aggregate. A passing verifier must prove the route pages render real content, not only that they avoid an error prompt.

## Verification

- `node --check scripts\real-server-visual-smoke.mjs`
- `git diff --check`

## Next

- Rerun the real personal-media guard under the stronger route-content assertions.
