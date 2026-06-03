# 2026-06-04 00:11 - Real Playback Download Endpoint Forbidden

## Summary
- Reran the real-account command-only playback guard after the DirectPlay download-endpoint release.
- The sampled item still did not play.
- The new download endpoint was not usable for this real server/account: upstream returned `403` for the first Range request.

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
- Stream proxy evidence:
  - first Range request to the download endpoint received upstream `403`
  - content type was `text/plain`
  - body length was `61`
- Player DOM controls were present, and cleanup passed with no `emby-player.exe`/`mpv.exe` process remaining.

## Verification
- Command: real-account `HILLS_REAL_COMMAND_ONLY=1` against `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`.
- Temporary credential input was removed after the run.
- Follow-up `Get-Process emby-player,mpv` returned no processes.

## Next
- Run a lightweight real-account Range probe across candidate no-transcode endpoints before changing playback URL selection again.
