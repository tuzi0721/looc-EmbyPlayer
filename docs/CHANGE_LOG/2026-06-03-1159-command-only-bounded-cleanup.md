# 2026-06-03 11:59 - Command-only bounded cleanup

## Changed

- Shortened command-only playback state polling so one page-side `Runtime.evaluate` cannot spend almost the full CDP timeout budget.
- Wrapped command-only `stop`, `embedSetVisible(false)`, and `embedDetach()` cleanup calls in short bounded waits.
- The command-only result now reports cleanup status instead of blocking indefinitely on cleanup.

## Verification

- `node --check scripts\real-server-visual-smoke.mjs`

## Result

The command-only verifier is ready for another real-account run and should report final command-chain evidence instead of timing out during cleanup.
