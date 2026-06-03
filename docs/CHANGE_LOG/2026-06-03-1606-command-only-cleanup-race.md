# 2026-06-03 16:06 - command-only cleanup race found

## Scope

- Reran real-account command-only verification against the `16:04:46` release exe.
- Used the new PlaybackInfo diagnostics.

## Evidence

- Real setup succeeded through Emby detection, login, real lists, and setup PlaybackInfo.
- Embedded attach still completed successfully.
- The command-only verifier started polling mpv state before backend `play` had started.
- Backend `play` began around 10 seconds after attach, but the verifier immediately started cleanup:
  - `play:start`
  - `play:active-account`
  - `play:server-ready`
  - `embed_visible:hide`
  - `embed_detach:start`
- No `play:item-ready` or PlaybackInfo diagnostic was reached in this run because cleanup interrupted the playback command.

## Result

- This run exposed a verifier race, not a definitive app playback failure.
- Next step: change command-only verification to wait for backend `play` progress or a player error before cleanup.
