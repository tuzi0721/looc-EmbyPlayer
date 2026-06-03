# 2026-06-03 16:35 - auth query still leaves mpv loading failed

## Scope

- Reran real-account command-only verification against the `16:33:12` release exe with stream URLs carrying `api_key`.

## Evidence

- Real setup succeeded.
- Backend playback reached DirectPlay source selection and `loadfile`.
- mpv still reported:
  - `mpv:event:start-file`
  - `mpv:event:load-wait-error error=Raw(-13)`
  - `mpv:load-not-ready generation=1 path=false stream_path=false demuxer=none`
- `Raw(-13)` maps to `MPV_ERROR_LOADING_FAILED`.
- State remained empty and no independent `mpv.exe` was reported.

## Result

- Adding `api_key` was not enough to make libmpv open the stream.
- Next step: enable sanitized mpv log messages on the main handle to see whether the failure is HTTP/auth, TLS, protocol, or demuxer related.
