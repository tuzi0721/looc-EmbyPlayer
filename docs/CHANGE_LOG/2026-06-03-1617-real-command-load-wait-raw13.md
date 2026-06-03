# 2026-06-03 16:17 - real command-only load wait reports Raw(-13)

## Scope

- Reran real-account command-only verification against the `16:15:45` release exe.
- Used main-handle mpv event/readiness polling.

## Evidence

- Real setup succeeded.
- Backend playback reached `play:mpv-load-start`.
- Main mpv event polling observed:
  - `mpv:event:start-file`
  - `mpv:event:load-wait-error error=Raw(-13)`
  - `mpv:load-not-ready generation=1 path=false stream_path=false demuxer=none`
- Backend still returned from `play`, but mpv state stayed empty.
- Final verifier failures:
  - embedded host did not attach (log tail truncation likely hid the earlier attach line)
  - mpv state did not become ready
  - mpv diagnostic error: `Raw(-13)`
- No independent `mpv.exe` was reported and cleanup succeeded.

## Result

- The active blocker is mpv load failure/readiness after `start-file`.
- Next step: map `Raw(-13)` and adjust load/readiness handling so failed loads surface clearly and successful direct streams reach media state.
