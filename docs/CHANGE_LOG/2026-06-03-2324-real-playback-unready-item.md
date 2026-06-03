# 2026-06-03 23:24 - Real Playback Unready Item

## Summary
- Recorded the latest real-account playback failure instead of treating the verifier work as progress.
- The selected real item reached the backend mpv load path, but mpv never exposed a playable media state.
- This matches the user-visible black-screen class of failure and must be fixed before claiming playback is healthy.

## Evidence
- Real item sampled by the guard: `34535`.
- PlaybackInfo selected local decode: `DirectPlay`.
- Backend visual log reached `play:mpv-load-complete`.
- Player state did not become ready:
  - `durationMs=0`
  - `trackCount=0`
  - no video params
- Pause/resume/seek checks could not pass because mpv never reached a usable media state.
- Cleanup still passed: embedded detach completed and no residual `mpv.exe` was reported.

## Verification
- No new verification command in this phase; this log preserves the failed real-account result from the preceding run so the next phase targets the real playback bug instead of screenshot evidence.

## Next
- Inspect the stream proxy and mpv load/readiness diagnostics for why a `DirectPlay` real item can report load-complete while mpv has no duration or tracks.
