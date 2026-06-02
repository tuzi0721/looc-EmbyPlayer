# 2026-06-02 15:09 Native Screenshot And History Images

## Scope
- Changed real visual smoke so native host screenshot capture only runs when the app exposes a concrete native host window handle.
- When no native host handle exists, the smoke now records `player-native-capture-skipped` and keeps using the in-app player screenshot plus mpv state as visual evidence.
- Reordered card image candidates to prefer tagged parent Backdrop/Thumb/Primary images before untagged fallbacks, improving real Episode history/favorites image loading.

## Verification
- `node --check scripts\real-server-visual-smoke.mjs`
- `npm.cmd run build`
- `node scripts\smoke-electron-home-hero.mjs`

## Result
- Local Electron smoke returned `ok: true`.
- Local history cards loaded images `3/3`, favorites loaded `2/2`, and aggregate loaded `6/6`.
- Cross-server favorites/history card clicks still switch to the clicked source account and retain source query values.

## Pending
- A real-server keep-artifacts rerun after the native screenshot fix confirmed native capture is skipped when no controlled handle exists, but still exposed a real `/history` image-loading failure before the image-candidate ordering fix.
- The follow-up real-server rerun after the image-candidate ordering fix is blocked by the current network escalation approval failure and still needs explicit approval.

## Notes
- No credentials, tokens, complete server URLs, or playback URLs are recorded in this log.
