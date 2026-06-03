# 2026-06-03 15:14 Command-only target selection fix

## What changed

- Split CDP page target handling into `summarizePageTargets`, `selectPageTarget`, and `getPageTarget(initialTargets)`.
- `getPageTarget` now evaluates the initially fetched target list before any requery.
- If the first target is usable but a follow-up requery fails, the verifier now reports the reusable target and the requery error instead of failing before target logging.

## Verification

- `node --check scripts\real-server-visual-smoke.mjs`

## Next

- Rerun real-account command-only validation against the rebuilt Tauri release without screenshots.
