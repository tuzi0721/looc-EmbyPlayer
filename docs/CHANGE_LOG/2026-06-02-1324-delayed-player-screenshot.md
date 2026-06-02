# 2026-06-02 13:24 Delayed Player Screenshot

## Scope
- Adjusted the real-account visual smoke based on user feedback that playback startup is not instant.
- The player visual check now waits until playback exposes usable video state, then waits another 5 seconds before capturing the screenshot.
- Added `player-visual-ready` stage output so future runs show whether the player was ready before the delayed screenshot.

## Verification
- Passed: `node --check scripts\real-server-visual-smoke.mjs`

## Notes
- This improves the validity of the visual smoke. It does not by itself mark real playback or Series detail playback as passed.
