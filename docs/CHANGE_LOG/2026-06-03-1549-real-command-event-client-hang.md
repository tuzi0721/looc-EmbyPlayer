# 2026-06-03 15:49 - real command-only hang narrowed to mpv event client

## Scope

- Reran the real-account command-only verifier against the `15:47:25` release exe.
- Kept screenshots disabled.
- Used the new embedded bind diagnostics.

## Evidence

- Real server setup again succeeded through Emby detection, login, media lists, and `DirectPlay` PlaybackInfo with 2 media sources.
- Playback still failed with `Runtime.evaluate timeout`.
- App diagnostics now narrowed the blocking point to embedded mpv initialization:
  - `embed_attach:bind-start`
  - `mpv:manager:lazy-new-start`
  - `mpv:new:start`
  - `mpv:new:mpv-created`
  - `mpv:new:properties-set`
  - `mpv:new:event-thread-start`
- No `mpv:new:complete`, host creation, or `wid` bind log was reached.
- The temp credential input file was deleted.
- Process check found no residual app/mpv/smoke process after failure.

## Result

- The current blocker is not the native child window or `wid` property yet.
- It is the extra libmpv event-client setup before attach completes.
- Next step: remove or defer the blocking event-client setup so attach can return and playback can proceed.
