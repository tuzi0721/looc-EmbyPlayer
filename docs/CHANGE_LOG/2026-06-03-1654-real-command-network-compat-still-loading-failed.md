# 2026-06-03 16:54 - network compatibility still leaves mpv loading failed

## Scope

- Reran real-account command-only verification against the `16:52:46` release exe.
- This build used `tls-verify=false` and `network-timeout=10` for embedded libmpv.

## Evidence

- Real setup succeeded.
- Backend playback reached DirectPlay source selection and `loadfile`.
- mpv still reported:
  - `mpv:event:start-file`
  - `mpv:event:load-wait-error error=Raw(-13)`
  - `mpv:load-not-ready generation=1 path=false stream_path=false demuxer=none`
- State remained empty.
- No independent `mpv.exe` was reported and cleanup succeeded.

## Result

- TLS verification was not the only cause.
- The active blocker remains embedded libmpv opening the remote direct stream.
- Next likely direction is to avoid handing the remote URL directly to libmpv, or add a sanitized local stream/proxy path that fetches with the app HTTP client and feeds mpv locally while preserving local decode.
