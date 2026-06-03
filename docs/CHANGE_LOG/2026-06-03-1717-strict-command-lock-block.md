# 2026-06-03 17:17 strict command lock block

## Result
- Ran the stricter real-account command-only smoke against the `17:15:59` release exe.
- Real setup still succeeded: Emby detection, login, views/resume/hero/media/series, and DirectPlay PlaybackInfo with 2 media sources.
- Embedded attach succeeded and playback reached `play:stream-proxy-ready`, `play:mpv-load-start`, `mpv:command:load-complete`, and `mpv:event:start-file`.

## Failure
- The stricter run failed with:
  - `player get_state timed out`
  - `backend mpv load did not complete`
  - `mpv video state did not become ready`
- Visual-smoke diagnostics showed `get_state:start` after `mpv:event:start-file`, then mpv events continued (`audio-reconfig`, `file-loaded`, `playback-restart`) but `play:mpv-load-complete` did not appear before cleanup.
- Root cause identified: the stricter `wait_for_load_readiness` holds the embedded mpv mutex while waiting up to 8 seconds for video evidence. That blocks `get_state`/`stop` and makes the verifier time out.

## Cleanup
- No independent `mpv.exe` process was reported.
- Temporary credential input file was deleted by the script.

## Next
- Change embedded readiness diagnostics so they do not hold the mpv mutex for the full wait window.
- Keep strict video readiness reporting, but let `play`, `get_state`, and `stop` remain responsive.
