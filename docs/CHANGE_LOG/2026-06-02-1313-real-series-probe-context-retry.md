# 2026-06-02 13:13 Real Series Probe Context Retry

## Scope
- First real-account visual smoke attempt reached the Series detail play probe, but the test script failed with `Runtime.evaluate: Execution context was destroyed`.
- This was a smoke-script robustness issue during page/player route transition, not a passing playback result.
- Reworked the Series probe into short CDP steps: push Series detail route, poll the play button rectangle, click via CDP input, poll `/player/:episodeId`, then stop playback and return home.
- Added a narrow retry helper for transient CDP execution-context resets during route transitions.

## Verification
- Passed: `node --check scripts\real-server-visual-smoke.mjs`

## Notes
- The next required step is to rerun the full real-account visual smoke and treat its final JSON/exit code as authoritative.
