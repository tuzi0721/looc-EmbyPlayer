# 2026-06-04 00:54 - Real Playback Window Ok Mp4 Unready

## Summary
- Reran the real-account command-only playback guard after adding the top-level window guard.
- The user-visible external-window class did not reproduce in the current release:
  - `topLevelPlaybackWindows` contained only the main `emby-player` window titled `Hills Lite`.
  - `externalMpv=[]`
  - `hillsWindowCount=1`
  - `playbackWindows.ok=true`
  - `mpvProcessCount=0`
- The sampled MP4 item still failed playback readiness:
  - DirectPlay source, `mp4`, `h264/aac`, `1920x1080`, `supportsTranscoding=false`
  - `durationMs=0`
  - `trackCount=0`
  - `videoTrackCount=0`
  - `idleActive=true`
  - `playlistPos=-1`

## Evidence
- Stream proxy Range preflight still returned `200 OK` without `Content-Range`.
- mpv still issued Range requests to the local proxy for this MP4 source.
- Upstream returned full `video/mp4` bodies for Range requests, then the read loop ended before mpv demuxed tracks.

## Verification
- Real release exe: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Real server/account command-only smoke with `HILLS_REAL_COMMAND_ONLY=1`
- Temporary credential input was deleted by the smoke flow.

## Next
- Treat MKV and MP4 separately: the lavf non-seekable path can reach video-ready for a sampled MKV, but the sampled MP4 still needs a different strategy.
- Add more redacted proxy diagnostics for the actual client `Range` header and adjust the proxy/mpv load path for range-broken MP4 sources.
