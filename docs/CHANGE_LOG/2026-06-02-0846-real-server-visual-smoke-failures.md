# 2026-06-02 08:46 Real-server visual smoke failures

## Scope
- Added `scripts/real-server-visual-smoke.mjs` for real-account Electron visual checks.
- The script reads real line/account credentials from stdin or `HILLS_REAL_*`, uses a temporary Electron user-data directory, captures screenshots under `%TEMP%`, and prints sanitized metrics only.

## Real-server result
- Line 1 detected as Emby, authenticated, and loaded 5 library views.
- Line 2 remained unavailable at the public-info step and did not block line 1 login.
- The selected real playback source was local-decode compatible (`DirectPlay`, direct stream/source capabilities present, transcoding disabled by source).

## Failures found
- Home hero aspect still drifts in compact windows; the 960x600 and 760x430 checks measured about 3.08 instead of a stable cinema ratio.
- At 1366x768 the second row was barely visible, so the first viewport still does not reliably reveal the next content rows.
- Real playback failed through HTML video with media error code 4 because the selected real source was an MKV file. This confirms HTML video is not enough for real Emby playback.
- Player screenshot/pixels were visually blank for the actual video area; seek and post-resize control checks could not pass after playback failed.
- Runtime cleanup passed: closing the temporary Electron app left no tracked mpv/helper child processes.

## Next
- Fix the home hero sizing so its visual ratio stays stable while still exposing rows below.
- Replace the Electron real-playback path with a visible, app-contained local decode path that can handle MKV and other mpv-supported containers without server transcoding.
- Re-run the real-server visual smoke after fixes.
