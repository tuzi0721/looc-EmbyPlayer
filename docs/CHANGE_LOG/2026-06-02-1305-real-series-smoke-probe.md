# 2026-06-02 13:05 Real Series Detail Playback Smoke Probe

## Scope
- Strengthened `scripts/real-server-visual-smoke.mjs` for the user-reported Series detail symptom: clicking play did not open anything.
- The real-server visual smoke now searches for a real `Series` candidate, captures Series detail layout across the same viewport set, clicks the Series detail hero play button, and asserts that the route opens a concrete `/player/:episodeId` player instead of silently staying on the Series page or opening the Series item itself.
- The probe stops playback immediately after the route check so it does not leave a background player running before the main full playback visual inspection.

## Verification
- Passed: `node --check scripts\real-server-visual-smoke.mjs`

## Notes
- No credentials, tokens, server URLs, or playback URLs were written into the repo.
- Full real-account execution still needs to run after the dev server / Electron environment is ready.
