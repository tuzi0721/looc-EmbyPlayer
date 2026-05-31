# Playback diagnostics

- **Time**: 2026-05-29 01:20 (UTC+8)
- **Motivation**: make the next playback failure diagnosable from local logs instead of guessing whether the problem is source selection, authentication headers, or mpv load acceptance.
- **Changed files**:
  - `electron/main.mjs` - write redacted JSON-line playback diagnostics to Electron user data as `playback.log`, including play request start, selected source, mpv load completion, and failed play requests.
  - `electron/backend/emby.mjs` - attach source diagnostics to playback sources, including selected MediaSource metadata, line identity, source kind, stream kind, direct-play intent, and direct stream auth shape without exposing tokens.
  - `electron/backend/mpv.mjs` - clear/set mpv HTTP headers as a string-list option for each load, include both Emby token and Authorization headers, and return the `loadfile` command acceptance metadata.
  - `docs/CURRENT_STATE.md` - record the playback diagnostics path and log files as the latest project state.
- **Risk**: low to medium. Playback behavior remains mpv-first, but mpv HTTP headers are now set as a native list instead of a CRLF-joined string and stale headers are cleared before each load. This should improve auth reliability, but it touches the load path directly.
- **Rollback**: revert this changelog, the diagnostics additions in the three Electron files, and the `CURRENT_STATE.md` update.
- **Verification**:
  1. `node --check electron/main.mjs`
  2. `node --check electron/backend/emby.mjs`
  3. `node --check electron/backend/mpv.mjs`
  4. `rg -n "[ \t]+$" electron/main.mjs electron/backend/emby.mjs electron/backend/mpv.mjs docs/CURRENT_STATE.md docs/CHANGE_LOG/2026-05-29-0120-playback-diagnostics.md`
  5. `npm.cmd run build`
  6. `npm.cmd run electron:build`
- **Result**: passed.
