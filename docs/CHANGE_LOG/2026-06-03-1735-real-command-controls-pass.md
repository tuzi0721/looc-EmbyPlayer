# 2026-06-03 17:35 real command controls pass

## Result
- Reran real-account command-only smoke with playback control checks.
- Smoke passed with no failures.
- Real setup succeeded and selected a real movie source with DirectPlay.
- Embedded lifecycle evidence was present: `embed_attach:complete`, `embed_visible:show`, and `embed_detach:complete`.
- Playback state evidence:
  - `durationMs=7375018`
  - `positionMs=25758`
  - `trackCount=4`
  - `videoTrackCount=1`
  - `videoTrackCodecs=["h264"]`
- Control-chain evidence:
  - `pauseOk=true`
  - `resumeOk=true`
  - `seekForwardOk=true`
  - `seekBackwardOk=true`
  - `startPositionMs=3260`
  - `forwardPositionMs=34884`
  - `backwardPositionMs=25758`
- Cleanup passed: `stop=true`, `hide=true`, `detach=true`.
- No independent `mpv.exe` process was reported.

## Verification
- Passed: real-account command-only smoke with control checks.
- No screenshots were used.
- Temporary credential input file was deleted by the script.

## Next
- Commit and push the control-check verifier/log update.
- Continue remaining UI/layout issues from the clean baseline.
