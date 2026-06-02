# 2026-06-02 13:29 Series Request Sequence Fix

## Scope
- Added `scripts/real-server-series-diagnose.mjs` for safe real-server Series diagnostics. It outputs only counts/types, not credentials, tokens, server URLs, media names, or playback URLs.
- Diagnosis for the failing real Series showed:
  - `Shows/{seriesId}/Seasons`: 1 season
  - `Shows/{seriesId}/Episodes?SeasonId=...`: 12 episodes
  - `Users/{userId}/Items?ParentId=<seasonId>`: 12 episodes
  - `Shows/{seriesId}/Episodes` without `SeasonId`: 12 episodes
- Since the real server does expose playable episodes, tightened the frontend fix in `DetailView.vue`: the Series play action no longer treats same-detail `episodeLoadSeq` changes from the season watcher as a reason to discard its own episode lookup. It now only aborts when the detail route or Series id changes.

## Verification
- Passed: `node --check scripts\real-server-series-diagnose.mjs`
- Passed: `node scripts\real-server-series-diagnose.mjs` with real test credentials
- Passed: `npm.cmd run build`

## Notes
- `check:local-decode` passed inside the build.
- Next step is to rerun Electron smoke and real-account visual smoke.
