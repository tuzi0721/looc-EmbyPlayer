# 2026-06-04 01:11 - Real MP4 Nonseekable Still Unready

## Summary
- Reran the real-account command-only playback guard against the `01:08` release.
- Login, server detection, media loading, embedded attach, and no-transcode PlaybackInfo succeeded.
- The selected real item was `DirectPlay` MP4 (`h264/aac`, `1920x1080`, `supportsTranscoding=false`).
- The real upstream still failed Range support (`Range` preflight returned `200` without `Content-Range`).
- The local proxy suppressed mpv's client Range and exposed the stream as nonseekable, but mpv still did not become video-ready.
- Evidence points to a Range-broken MP4 that likely needs tail metadata/index access; sequential nonseekable playback is not enough.

## Verification
- Real-account command-only smoke launched the packaged release exe.
- `domControls.ok=true`
- `playbackWindows.ok=true`
- Top-level window guard found only the main `emby-player` window and no visible top-level `mpv.exe`.
- Cleanup left `mpvProcessCount=0`.
- Follow-up process check found no remaining `emby-player` or `mpv` process.
- Temporary real-credential input file was removed.

## Failure Evidence
- `stateReady=false`
- `durationMs=0`
- `trackCount=0`
- `videoTrackCount=0`
- `idleActive=false`
- `fileFormat=none`
- `range_supported=false`
- Upstream response: `200 video/mp4`, `content_length=3899629089`
- Proxy sent about `313900004` bytes before cleanup without mpv discovering tracks.

## Next
- Stop relying on nonseekable DirectPlay for Range-broken MP4.
- Inspect the no-server-decode URL selection and add a safe DirectStream/container-copy fallback or a clear product error for MP4 sources that cannot be direct-played without Range support.
