# 2026-06-03 17:33 control pass attach tail gap

## Result
- Ran real-account command-only smoke with the new playback control checks.
- Real setup and proxy playback succeeded again.
- Control-chain evidence passed:
  - `pauseOk=true`
  - `resumeOk=true`
  - `seekForwardOk=true`
  - `seekBackwardOk=true`
  - `startPositionMs=3120`
  - `forwardPositionMs=34769`
  - `backwardPositionMs=25660`
- Cleanup passed: `stop=true`, `hide=true`, `detach=true`.
- No independent `mpv.exe` process was reported.

## Failure / diagnosis
- The smoke still exited with failure because `attached=false`.
- This is a verifier issue: `visualSmokeLog` only tailed the last 6000 characters, so the earlier `embed_attach:complete` line was truncated out of the evidence window.
- Later evidence (`embed_visible:show`, playback success, and `embed_detach:complete`) indicates the attach did happen.

## Next
- Increase the command-only visual-smoke log tail or make attach detection accept later embed lifecycle evidence.
- Rerun real-account command-only smoke.
