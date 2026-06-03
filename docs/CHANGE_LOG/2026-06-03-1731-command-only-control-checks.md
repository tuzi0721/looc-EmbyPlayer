# 2026-06-03 17:31 command-only control checks

## Changed
- Extended the real-account command-only smoke to validate playback controls after video state is ready:
  - pause
  - resume
  - seek forward 30 seconds
  - seek backward 10 seconds
- The smoke now fails with explicit control-chain messages if paused state or position movement does not reflect the command.

## Verification
- Passed: `node --check scripts\real-server-visual-smoke.mjs`
- No screenshots were used.

## Next
- Run real-account command-only smoke against the current release exe and verify the control chain.
