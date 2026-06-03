# 2026-06-03 23:50 - Real Playback Direct URL Priority Failure

## Summary
- Reran the real-account command-only playback guard after rebuilding the container stream URL release.
- The run still failed because the real item continued to use the server-provided direct URL before the new constructed `stream.mp4` fallback could apply.
- The failure remains the same black-screen class: mpv accepts load, but never demuxes duration/tracks/video.

## Evidence
- Result: `ok: false`.
- Selected real item: `34535`.
- PlaybackInfo selected `DirectPlay`.
- Selected source: `mp4`, `h264/aac`, `1920x1080`, `supportsTranscoding=false`.
- Player state stayed unready:
  - `durationMs=0`
  - `trackCount=0`
  - `videoTrackCount=0`
  - `idleActive=true`
  - `playlistPos=-1`
  - no demuxer/file format
- Stream proxy logs still showed Range requests receiving upstream `200` full `video/mp4` responses instead of `206 Partial Content`.
- The redacted upstream error included the direct URL shape `videos/34535/original.mp4`, proving the server-provided `DirectStreamUrl` path was still taking priority over the newly constructed `Videos/{id}/stream.mp4` path.
- Cleanup passed and no `emby-player.exe`/`mpv.exe` process remained after the run.

## Verification
- Command: real-account `HILLS_REAL_COMMAND_ONLY=1` against `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`.
- Temporary credential input was removed after the run.
- Follow-up `Get-Process emby-player,mpv` returned no processes.

## Next
- Change stream URL priority so safe container media sources use the constructed static endpoint first, then fall back to `DirectStreamUrl` only when a safe container endpoint cannot be built.
