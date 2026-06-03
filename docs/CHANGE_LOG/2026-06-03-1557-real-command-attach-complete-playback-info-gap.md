# 2026-06-03 15:57 - real command-only attach complete, playback info gap remains

## Scope

- Reran real-account command-only verification against the `15:55:59` release exe.
- Kept screenshots disabled.
- Verified the deferred event-client build moved past the previous attach blocker.

## Evidence

- Real setup succeeded through Emby detection, login, real lists, and `DirectPlay` PlaybackInfo with 2 media sources.
- Embedded attach completed:
  - `mpv:new:event-thread-deferred`
  - `mpv:new:complete`
  - `mpv:bind:create-host-complete`
  - `mpv:bind:set-wid-complete`
  - `embed_attach:complete`
- No independent `mpv.exe` was reported.
- Cleanup reported `stop=true`, `hide=true`, `detach=true`.
- Playback still failed:
  - `play:start`
  - `play:active-account`
  - `play:server-ready`
  - `play:item-ready`
  - no `play:playback-info`
  - no `play:mpv-load-start`
- Final command-only failures were:
  - backend play did not reach mpv load
  - backend mpv load did not complete
  - mpv state did not become ready

## Result

- The embedded attach/window binding issue is no longer the active blocker.
- The next blocker is inside `play` between item fetch and playback-info completion.
