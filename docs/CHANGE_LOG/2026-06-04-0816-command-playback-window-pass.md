# 2026-06-04 08:16 - Command playback window pass

## What changed

- No product code changed in this phase.
- Reran the narrow real-account Tauri release playback check after the personal-image fix to verify the user-reported separate-window symptom against a fixed playable item.

## Verification

- Real-account Tauri release command-only smoke with fixed item `21648`:
  - `ok=true`, `failures=[]`
  - route opened `/player/21648?start=0`
  - PlaybackInfo selected `DirectPlay`
  - server transcoding remained disabled (`supportsTranscoding=false`)
  - backend reached `play:mpv-load-complete`
  - player state became ready with one video track and real H.264/AAC state
  - native embedded window pixel evidence passed
  - top-level playback window check passed: one `Hills Lite` app window, no external `mpv.exe` window
  - `mpvProcessCount=0`
  - route-away cleanup detached the embedded host
  - temporary credential input file was removed
  - reported temp artifact directory no longer existed
  - no `real-smoke-frame-*.png` test screenshots remained in the app screenshot directory

## Note

This proves the fixed-item command playback path is embedded and receives a real playback URL. It does not close the broader full-flow failures reported earlier, where detail-page timing, initial black player readiness, and cleanup behavior still need to be chased.

## Next

- Continue with full real-account smoke failures instead of treating this narrow pass as the final playback answer.
