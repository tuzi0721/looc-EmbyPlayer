# 2026-06-04 07:30 - Full smoke after probe isolation failed

## Result

Full real-account Tauri release smoke still failed after rebuilding the `f1989e5` release.

## Release artifact

- `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Size: `8,671,232` bytes
- Last write time: `2026-06-04 07:25:55`

## Evidence

- Release build and package integrity passed with 7 bundled mpv files.
- Real server detection succeeded:
  - line 1 reported down
  - line 2 reported healthy
  - server kind was detected as Emby
- The series-detail smoke probe no longer opened a second playback session by default (`clickSkipped=true`), so the earlier full-smoke playback pollution is isolated.
- The detail/series play hit target is still wrong: CDP hit testing lands on `SECTION.hero` instead of the play `BUTTON`.
- The selected playback item remained `21648`, DirectPlay MKV, `1440x1080`, H.264/AAC, `supportsTranscoding=false`.
- Initial player readiness still failed after the delayed screenshot window:
  - `player-visual-ready=false`
  - first player screenshot was judged visually black/blank
  - seek-back validation was skipped because the player was not ready yet
- Later resize checks did receive native embedded/mpv evidence:
  - mpv state reported duration, position, tracks, H.264/AAC codecs, and `video-out-params`
  - aspect evidence was correct for the 4:3 source at `1366x768`, `960x600`, and `760x430`
  - native child capture produced nonblank pixels
- Runtime cleanup initially reported one remaining launched process, but the smoke runner's final process cleanup killed the launched process tree. A follow-up process check listed no `emby-player` or `mpv`.
- The retained temp artifact path reported by the failed smoke no longer existed when checked, so no smoke artifact directory was left behind.

## Remaining failures

- Series/detail play button is not the top hit target (`SECTION.hero`).
- `/history` visible cards did not load images.
- Search did not return the selected real item.
- Player did not become ready before the delayed screenshot and the first screenshot was black/blank.
- Seek-back validation was skipped because readiness was late.
- Runtime cleanup still reports false before final taskkill cleanup.

## Next

- Fix the detail hero stacking/hit-test layout so real clicks reach the play button.
- Fix personal-media image loading for `/history` first, then search selection.
- Investigate why the player is ready during later resize evidence but not during the initial delayed readiness window.
- Tighten app/player shutdown so normal cleanup exits without relying on final taskkill.
