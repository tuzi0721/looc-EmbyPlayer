# 2026-06-03 16:57 local stream proxy plan

## Context
- Continued from the real-account command-only evidence where embedded libmpv reaches `loadfile` but fails remote DirectPlay URLs with `MPV_ERROR_LOADING_FAILED` / `Raw(-13)`.
- Real Emby setup, login, PlaybackInfo, local-decode media source selection, embedded attach, and mpv load command are already reached.
- Direct remote URL compatibility attempts are exhausted for now: header formatting, `api_key`, `DirectStreamUrl`, TLS verify off, and network timeout still fail.

## Decision
- Move the next implementation phase to a local app-side stream proxy.
- The proxy will feed mpv a `127.0.0.1` URL while the app HTTP client forwards bytes from the authenticated real server stream.
- This preserves local decode and does not enable server transcoding.

## Verification
- Current phase is a restart/plan checkpoint only.
- No screenshots were used.

## Next
- Implement a short-lived Range-aware byte-forwarding proxy in the Tauri backend.
- Route `play` through the proxy before calling embedded mpv.
- Keep credentials, tokens, and real stream URLs out of logs and frontend-visible diagnostics.
