# 2026-06-02 13:16 Series Play Fallback Seasons

## Scope
- Real-account visual smoke exposed the actual Series detail failure:
  - The Series play button existed and was enabled.
  - Clicking it stayed on the Series detail route.
  - The page showed `当前剧集没有可播放单集。`
- Updated `DetailView.vue` so Series play no longer only trusts the active/first season.
- Series play now checks the active season, then every known season, then falls back to all episodes for the Series. It still prefers in-progress episodes before the first available episode.

## Verification
- Passed: `npm.cmd run build`

## Notes
- `check:local-decode` passed inside the build, so the server-side transcoding guard remains active.
- Next step is to rerun local Electron smoke and then real-account visual smoke.
