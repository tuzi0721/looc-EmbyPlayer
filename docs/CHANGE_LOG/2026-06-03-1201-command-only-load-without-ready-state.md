# 2026-06-03 12:01 - Command-only load without ready state

## Evidence

- Reran real-account command-only smoke against the latest Tauri release.
- Setup reached the real server and loaded account media: `viewCount=5`, `resumeCount=3`, `heroCount=36`, `mediaSourceCount=2`.
- Playback source was direct local decode compatible:
  - `playMethod=DirectPlay`
  - `container=mkv`
  - `videoCodec=h264`
  - `audioCodec=aac`
  - `supportsDirectPlay=true`
  - `supportsDirectStream=true`
  - `supportsTranscoding=false`
- Command chain reached:
  - `embed_attach:complete`
  - `play:mpv-load-start`
  - `play:mpv-load-complete`
  - `play:return`
- Cleanup completed:
  - `stop=true`
  - `hide=true`
  - `detach=true`
- No independent `mpv.exe` process was detected.

## Failure

- mpv state did not become ready.
- Reported state stayed at `durationMs=0`, `positionMs=0`, `trackCount=0`, `videoCodec=null`, `audioCodec=null`.

## Result

This is not a playback pass. The front-end route, real server request, backend play command, mpv load command, and cleanup now run, but libmpv still does not expose a loaded media state after `loadfile`. Next step is to add a persistent libmpv event pump/diagnostics so loaded-file events and error states are surfaced.
