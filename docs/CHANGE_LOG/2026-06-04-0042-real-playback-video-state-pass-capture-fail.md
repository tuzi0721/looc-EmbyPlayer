# 2026-06-04 00:42 - Real Playback Video State Pass Capture Fail

## Summary
- Reran the real-account command-only playback guard against the `00:40` release.
- The previous `property not found` blocker is gone: backend reached `play:mpv-load-complete`.
- mpv reached real loaded video state for a real DirectPlay item:
  - `durationMs=7375018`
  - `trackCount=4`
  - `videoTrackCount=1`
  - `videoCodec=h264`
  - `audioCodec=aac`
  - `fileFormat=mkv`
  - `idleActive=false`
  - `playlistCount=1`
  - `playlistPos=0`
  - `hasVideoParams=true`
  - `hasVideoEvidence=true`
- Player controls were present and functional: pause, resume, seek forward, and seek backward passed.
- Cleanup passed: route-away detached the embedded host and `mpvProcessCount=0`.

## Important Caveat
- The guard still returned `ok=false` because frame capture evidence failed:
  - mpv `screenshot-to-file` returned `error running command`
  - native PowerShell capture timed out
- This is not a full visual-inspection pass. It is a real playback-state pass that proves the black-screen `idleActive=true` / `trackCount=0` class was fixed for the sampled real item.

## Verification
- Real release exe: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Real server/account command-only smoke with `HILLS_REAL_COMMAND_ONLY=1`
- Temporary credential input file was removed by the smoke flow; follow-up `Remove-Item` found it already absent.
- Follow-up process check found no `emby-player` or `mpv` process.

## Next
- Stop treating screenshot capture as the same bug as playback readiness.
- Either repair native frame capture separately or move to the next user-visible player/layout issue while preserving the real video-ready guard.
