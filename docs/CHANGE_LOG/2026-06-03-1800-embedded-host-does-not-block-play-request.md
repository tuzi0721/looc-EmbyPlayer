# 2026-06-03 18:00 - embedded host does not block play request

## Context

- The latest reported failure was that opening playback could appear unresponsive and no backend/server request was observed.
- `PlayerView` mounted by awaiting embedded host setup before requesting item playback.
- If the embedded host attach/show path stalled, the real PlaybackInfo/play request could be delayed or skipped from the user's point of view.

## Changes

- Reduced the frontend embedded host attach wait to 3 seconds and show wait to 1.5 seconds.
- Embedded host setup failures now clean up local layout observers and continue into `startCurrentPlayback()`.
- The user still sees a player error message for the embedded host failure, but the real playback request is no longer blocked by host setup.

## Verification

- `npm.cmd run build`
- `git diff --check`
- Build included `check:local-decode`, confirming this phase did not add server-transcode behavior.

## Next

- Commit/push this phase, then continue on the remaining playback-output path so embedded video becomes visible instead of merely unblocking the backend request.
