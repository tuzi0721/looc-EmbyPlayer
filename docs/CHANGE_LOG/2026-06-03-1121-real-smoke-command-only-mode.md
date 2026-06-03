# 2026-06-03 11:21 - Real smoke command-only mode

## Changed

- Added `HILLS_REAL_COMMAND_ONLY=1` to `scripts\real-server-visual-smoke.mjs`.
- In this mode the script still uses the real login/setup path and real `PlaybackInfo`, but skips screenshot and pixel-capture stages.
- The command-only path opens the player route, waits for backend state, tails the app visual-smoke log, checks whether an independent `mpv.exe` process exists, stops playback, and reports command-chain evidence.

## Verification

- `node --check scripts\real-server-visual-smoke.mjs`
- `npm.cmd run build`

## Result

The non-screenshot command-chain verifier is ready for real-account playback testing. It does not replace visual review, but it directly checks whether playback commands reach the backend and whether mpv state becomes ready.
