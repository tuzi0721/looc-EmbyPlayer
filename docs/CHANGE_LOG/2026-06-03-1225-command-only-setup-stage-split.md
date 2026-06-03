# 2026-06-03 12:25 command-only setup stage split

## Scope

- Split the Tauri command-only real-smoke setup into staged bridge calls.
- Each step now emits a Node-side stage: bridge readiness, settings, detect, add server, login, route home, views, resume, hero, media, series, and playback source.
- Bridge calls now have page-side timeouts so a stuck backend command reports its command name instead of a generic `Runtime.evaluate timeout`.

## Evidence

- The `12:21` retry still timed out at the old monolithic `setup-start`, so the release import fix was not enough to isolate the issue.
- There were no residual app/mpv processes and the temp credential file was deleted after that retry.

## Verification

- `node --check scripts\real-server-visual-smoke.mjs`

## Result

This is still verifier instrumentation, not a playback pass. Next phase is another real-account command-only run to identify the exact setup command or proceed to playback diagnostics.
