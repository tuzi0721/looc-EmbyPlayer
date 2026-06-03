# 2026-06-03 16:09 - real command-only reaches load, mpv state remains empty

## Scope

- Reran real-account command-only verification after fixing the verifier cleanup race.
- Used the existing `16:04:46` release exe.

## Evidence

- Real setup succeeded.
- Embedded attach completed.
- Backend play completed:
  - `play:item-ready`
  - `play:playback-info-line id=real-line-2`
  - `play:playback-info media_sources=2`
  - `play:source-selected`
  - `play:stream-url-ready`
  - `play:mpv-load-start`
  - `mpv:command:load-complete generation=1`
  - `play:mpv-load-complete`
  - `play:return`
- No independent `mpv.exe` was reported.
- Cleanup succeeded.

## Failure

- The verifier still failed because mpv state never became ready.
- Final state remained empty:
  - `durationMs=0`
  - `trackCount=0`
  - `videoCodec=null`
  - `videoParams=null`
- Embedded backend diagnostics only showed `lastEvent=load-command-complete`; no file-loaded/reconfig data exists while the event client is deferred.

## Result

- Startup, attach, PlaybackInfo, DirectPlay source selection, and mpv load command are now all reached.
- The active blocker is mpv media readiness/state after `loadfile`.
