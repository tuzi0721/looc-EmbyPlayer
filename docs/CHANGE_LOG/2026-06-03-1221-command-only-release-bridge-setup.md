# 2026-06-03 12:21 command-only release bridge setup

## Scope

- Fixed the command-only real-smoke setup path for packaged Tauri release builds.
- The setup and command-only player probe now prefer `window.hillsLite.invoke(...)` instead of importing `/src/api/index.ts` and Pinia stores.
- This avoids a release-only `Runtime.evaluate timeout` before any backend request is issued.

## Evidence

- Previous command-only run against the `12:14` release failed at `setup-start` with `Runtime.evaluate timeout`.
- App `visual-smoke.log` only contained the CDP startup line, confirming no backend player/media command had been reached.
- No `emby-player.exe` or `mpv.exe` residual process remained after the failed run; the temp credential file was deleted.

## Verification

- `node --check scripts\real-server-visual-smoke.mjs`

## Result

The command-only verifier can now use the packaged Tauri bridge directly. Next phase is to rerun the real-account command-only smoke against the same release exe, still without screenshots.
