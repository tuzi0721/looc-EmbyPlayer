# 2026-06-03 22:34 - Personal search input event hardening

## What changed

- Hardened the `HILLS_REAL_PERSONAL_ONLY=1` Aggregate UI search action.
- The verifier now focuses the search box, uses the native input value setter, dispatches `InputEvent` and `change`, and waits up to 10 seconds for search results.
- Added search debug fields for waited time, loading/empty state, and input/term length.

## Why

The backend all-account search was returning sourced results, while the UI search automation still rendered zero cards. This change separates weak event injection from an actual product search failure.

## Verification

- `node --check scripts\real-server-visual-smoke.mjs`
- `git diff --check`

## Next

- Rerun the real personal-media guard without rebuilding the app.
