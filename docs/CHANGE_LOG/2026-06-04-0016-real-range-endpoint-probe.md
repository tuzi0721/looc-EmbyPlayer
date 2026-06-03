# 2026-06-04 00:16 - Real Range Endpoint Probe

## Summary
- Ran a lightweight real-account Range probe outside the player to stop guessing at playback URL shapes.
- The probe logged in successfully through line 1 and tested the sampled real item `34535`.
- No tested no-transcode stream/direct endpoint returned `206 Partial Content`.
- The download endpoint is not usable for this account/server because it returns `403`.

## Evidence
- Media source: `mp4`, protocol `File`, `supportsDirectPlay=true`, `supportsDirectStream=true`, `supportsTranscoding=false`.
- Tested with `Range: bytes=0-1023` and `Range: bytes=-65536`.
- `DirectStreamUrl`: `200`, `video/mp4`, full content length, no `Content-Range`, `Accept-Ranges: bytes`.
- `Videos/{id}/stream.mp4`: `200`, `video/mp4`, full content length, no `Content-Range`, `Accept-Ranges: bytes`.
- `Videos/{id}/stream`: `200`, `video/mp4`, full content length, no `Content-Range`, `Accept-Ranges: bytes`.
- `Items/{id}/Download`: `403`, `text/plain`, no range support.

## Verification
- Command: temporary real-account endpoint probe.
- Temporary probe script and credential input were deleted after the run.
- Follow-up `Get-Process emby-player,mpv` returned no processes.

## Next
- Add a playback-time Range preflight. If a no-transcode URL claims or receives Range but does not return `206`, load it in mpv with HTTP seeking disabled so mpv reads sequentially instead of falling into an idle Range retry loop.
