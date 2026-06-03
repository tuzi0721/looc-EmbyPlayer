# 2026-06-03 17:25 real command strict proxy pass

## Result
- Ran the strict real-account command-only smoke against the `17:24:21` release exe.
- Real setup succeeded: Emby detection, login, views/resume/hero/media/series, and DirectPlay PlaybackInfo with 2 media sources.
- Embedded attach succeeded.
- Backend playback reached:
  - `play:stream-proxy-ready`
  - `play:mpv-load-start`
  - `mpv:command:load-complete`
  - `play:mpv-load-complete`
  - `play:return`
- Strict player state passed:
  - `durationMs=1420032`
  - `positionMs=3270`
  - `trackCount=4`
  - `videoTrackCount=1`
  - `videoTrackCodecs=["h264"]`
  - `fileLoadedCount=1`
  - `playbackRestartCount=1`
- No independent `mpv.exe` process was reported.
- Cleanup passed: `stop=true`, `hide=true`, `detach=true`.

## Verification
- Passed: real-account strict command-only smoke.
- No screenshots were used.
- Temporary credential input file was deleted by the script.

## Notes
- This proves the real-server local proxy playback/control chain under command-only verification.
- It is not a screenshot-based visual inspection; screenshot checks remain intentionally skipped per the current no-screenshot constraint.

## Next
- Continue with the remaining user-facing UI/playback issues now that real embedded playback is no longer blocked by remote URL loading.
