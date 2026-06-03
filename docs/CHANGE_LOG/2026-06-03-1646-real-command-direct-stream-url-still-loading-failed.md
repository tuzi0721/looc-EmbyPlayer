# 2026-06-03 16:46 - DirectStreamUrl still leaves mpv loading failed

## Scope

- Reran real-account command-only verification against the `16:44:19` release exe.
- This build preferred server-provided `MediaSource.DirectStreamUrl` when present.

## Evidence

- Real setup succeeded.
- Backend playback again reached DirectPlay source selection and `loadfile`.
- mpv still reported:
  - `mpv:event:start-file`
  - `mpv:event:load-wait-error error=Raw(-13)`
  - `mpv:load-not-ready generation=1 path=false stream_path=false demuxer=none`
- `Raw(-13)` is `MPV_ERROR_LOADING_FAILED`.
- No independent `mpv.exe` was reported and cleanup succeeded.

## Result

- Preferring `DirectStreamUrl` did not resolve libmpv stream opening.
- Next step: try embedded libmpv network compatibility settings, starting with TLS verification disabled for private-server direct streams.
