# 2026-06-03 17:07 real command local proxy load ready

## Result
- Ran the real-account command-only smoke against the `17:06:21` release exe.
- Real setup succeeded: detected Emby, logged in, loaded views/resume/hero/media/series, and PlaybackInfo returned `DirectPlay` with 2 media sources.
- Embedded mpv attach completed with no independent `mpv.exe` process.
- Backend playback reached the new local proxy stage: `play:stream-proxy-ready`.
- Embedded mpv reached `mpv:load-ready generation=1 duration=1420.032 tracks=4`.
- The previous remote URL failure (`Raw(-13)` / `MPV_ERROR_LOADING_FAILED`) did not appear in this run.

## Verification
- Passed: real-account command-only smoke.
- No screenshots were used.
- Cleanup reported `stop=true`, `hide=true`, and `detach=true`.

## Remaining
- The command-only state still reported `videoCodec=null` and no video params at the sampled moment, even though duration/tracks were loaded.
- Do not claim visual playback is fully proven yet.

## Next
- Tighten the command-only verifier so it waits longer after backend load and reports video params/frame evidence more strictly.
