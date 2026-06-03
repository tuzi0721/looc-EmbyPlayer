# 2026-06-04 01:21 - Real Dynamic Endpoint Probe Timeout

## Summary
- Started a temporary real-account endpoint probe for alternate stream URLs such as dynamic `stream.mp4`, `stream.mkv`, `stream.ts`, and explicit `VideoCodec=copy` / `AudioCodec=copy` shapes.
- The probe was designed to read only the first 1 MiB of each candidate and then cancel, so it would not download the full 3.9 GB sampled MP4.
- The probe did not return within the bounded interactive window and was terminated to avoid another stuck debug run.
- The temporary probe script and credential input were removed.

## Verification
- The stuck probe process was terminated.
- Follow-up process check found no `emby-player` or `mpv` process.
- The only remaining `node.exe` process belonged to the Codex runtime, not the probe.

## Result
- This did not produce a viable alternate endpoint.
- The reliable evidence remains: direct/static/original MP4 paths do not provide usable Range support on the real server, and PlaybackInfo does not return a copy/remux URL while server transcoding is disabled.

## Next
- Implement product behavior for Range-broken MP4 instead of leaving black playback: detect the class before mpv load and fail with a clear local-decode message or offer a download-first local playback path.
