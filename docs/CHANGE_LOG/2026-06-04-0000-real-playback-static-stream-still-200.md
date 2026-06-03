# 2026-06-04 00:00 - Real Playback Static Stream Still 200

## Summary
- Reran the real-account command-only playback guard after the static stream priority release.
- The run still failed: mpv accepted the load command but never reached a video-ready state.
- The constructed static stream endpoint also received upstream `200 OK` responses for mpv Range requests, so this server path still does not provide the partial-content behavior mpv needs for the sampled large MP4.

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
- Player DOM controls were present, and cleanup passed with no `emby-player.exe`/`mpv.exe` process remaining.

## Verification
- Command: real-account `HILLS_REAL_COMMAND_ONLY=1` against `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`.
- Temporary credential input was removed after the run.
- Follow-up `Get-Process emby-player,mpv` returned no processes.

## Next
- For safe DirectPlay sources, try the original-file download endpoint `/Items/{id}/Download` before stream endpoints. This still keeps decoding local and does not request server transcoding.
