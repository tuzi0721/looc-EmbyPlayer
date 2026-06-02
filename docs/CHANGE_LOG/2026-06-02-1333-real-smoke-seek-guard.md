# 2026-06-02 13:33 Real Smoke Seek Guard

## Scope
- Real-account smoke confirmed the Series detail fix: the real Series route opened a concrete episode player route without an action error.
- The same run then selected a different main playback candidate whose player did not expose duration/tracks/video params within 25 seconds, even after the delayed screenshot path.
- The smoke script previously crashed when it tried to seek on that not-ready player.
- Updated the smoke so seek is skipped or recorded as a failure when playback is not ready, instead of terminating the script before final JSON.

## Verification
- Passed: `node --check scripts\real-server-visual-smoke.mjs`

## Notes
- Next step is another full real-account visual smoke run to capture a complete pass/fail report.
