# 2026-06-03 22:56 - Native Capture Timeout

## Summary
- Hardened the real playback verifier after native PowerShell capture hung during command-only playback validation.
- Native window capture now runs with a 12 second timeout and `SIGKILL` kill signal.
- The shared `run()` helper now reports `spawnSync` errors such as timeout details instead of collapsing them to an unhelpful process status.

## Verification
- `node --check scripts\real-server-visual-smoke.mjs`
- `git diff --check`

## Next
- Rerun the real-account command-only playback guard against the already rebuilt release executable.
