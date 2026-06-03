# 2026-06-03 18:11 - real command pass on 18:09 release

## Scope

- Ran a no-screenshot real-account command-only verification against the `18:09:19` Tauri release exe.
- The run used the real Emby setup/login/playback path and did not record screenshots.

## Evidence

- Real setup succeeded:
  - Emby detection succeeded.
  - One line was healthy and selected automatically.
  - Views, resume, hero, media, series, and PlaybackInfo loaded.
- Playback source:
  - `DirectPlay`
  - server transcoding remained disabled.
  - backend reached `play:stream-proxy-ready`, `play:mpv-load-complete`, and `play:return`.
- Embedded player:
  - `embed_attach:complete`
  - `attached=true`
  - state became ready with `durationMs=866026`, `positionMs=24225`, `trackCount=4`, `videoTrackCount=1`, `videoTrackCodecs=["h264"]`.
- Controls:
  - `pauseOk=true`
  - `resumeOk=true`
  - `seekForwardOk=true`
  - `seekBackwardOk=true`
- Cleanup:
  - `stop=true`
  - `hide=true`
  - `detach=true`
  - no independent `mpv.exe` process was reported.

## Verification

- Passed: real-account strict command-only smoke.
- No screenshots were used.
- Sensitive data and real stream URLs were not written into this log.

## Next

- Continue remaining UI/layout issues and any visual-output issues that require user-visible inspection.
