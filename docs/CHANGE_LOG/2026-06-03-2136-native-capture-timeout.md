# 2026-06-03 21:36 - Native capture timeout guard

## Changed
- Added a timeout to the PowerShell native-window capture used by the real-account command-only verifier so a stuck capture cannot block cleanup or leave playback running during validation.

## Verified
- `node --check scripts\real-server-visual-smoke.mjs`

## Next
- Rerun real-account command-only validation against the latest packaged executable.
