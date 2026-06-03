# 2026-06-03 23:38 - Real Playback Range 200 Failure

## Summary
- Reran the real-account command-only playback guard against the rebuilt release with the new diagnostics.
- The run still failed, but the failure is now actionable instead of opaque.
- Real login, library loading, PlaybackInfo, player route, DOM controls, and cleanup all behaved; mpv did not become ready.

## Evidence
- Result: `ok: false`.
- Selected real item: `34535`.
- PlaybackInfo selected `DirectPlay`.
- Selected source: `mp4`, `h264/aac`, `1920x1080`, `supportsTranscoding=false`.
- Player state stayed unready:
  - `durationMs=0`
  - `trackCount=0`
  - `videoTrackCount=0`
  - `eof=false`
  - `idleActive=true`
  - `playlistCount=1`
  - `playlistPos=-1`
  - `demuxer=""`
  - `fileFormat=null`
- Player DOM controls were visible and in viewport.
- Cleanup passed: route-away unmounted PlayerView, `embed_detach:complete` appeared, and `mpvProcessCount=0`.
- Stream proxy evidence showed mpv made Range requests, but upstream returned `200` with full `video/mp4` content instead of `206 Partial Content`.
- Because the requested range was not honored, mpv repeatedly read small chunks and returned to idle without demuxing tracks.

## Verification
- Command: real-account `HILLS_REAL_COMMAND_ONLY=1` against `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`.
- Temporary credential input was already removed by the verifier.
- Follow-up `Get-Process emby-player,mpv` returned no processes.

## Next
- Prefer container-qualified direct stream URLs such as `Videos/{id}/stream.mp4` when the media source has a safe container name, then rebuild and rerun the real-account guard.
