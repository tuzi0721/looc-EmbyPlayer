# 2026-06-04 01:42 - Real Clear Block Pass

## Summary
- Reran real-account command-only validation against the packaged release with fixed item `34535`.
- Used `HILLS_REAL_EXPECT_CLEAR_BLOCK=1` because this MP4 is confirmed Range-broken and has no streamable prefix metadata.
- The validation passed with `ok=true` and no failures.

## Evidence
- Selected item: `34535`
- Winning line: line 2
- PlaybackInfo: `DirectPlay`
- Selected source: `mp4`, `h264/aac`, `1920x1080`, `supportsTranscoding=false`
- Range probe: `200` without `Content-Range`, `supported=false`
- Prefix probe: first 2 MiB had `mdat=true`, `moov=false`, `moof=false`, `streamable=false`
- Backend blocked at `play:blocked-range-broken-mp4`
- `backendReachedLoad=false`
- `backendCompletedLoad=false`
- `playbackWindows.ok=true`
- `mpvProcessCount=0`
- Embedded detach completed.
- Independent follow-up process check found no `emby-player` or `mpv`.

## Result
- The sampled real MP4 no longer enters black mpv playback.
- The app displays a clear local-decode error and refuses to request server decoding/transcoding.

## Next
- Commit and push this playback clear-block phase.
- Continue with a download-first local playback affordance or the next user-visible layout/player issue.
