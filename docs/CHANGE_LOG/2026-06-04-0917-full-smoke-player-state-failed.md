# 2026-06-04 09:17 - Full smoke player state still failed

## Scope

- Docs-only validation record after commit `6636b04`.
- No product code changed in this phase.

## Verification Run

- Ran real-account Tauri release full smoke against the packaged exe:
  - `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
  - Real login/server detection succeeded.
  - The run selected real movie item `21648`.
  - PlaybackInfo still reported `DirectPlay` and `supportsTranscoding=false`.

## Passed Areas

- Home layout passed across `1920x1080`, `1366x768`, `1024x768`, `960x600`, and `760x430`.
- The real home state exposed 2 rows during this run.
- Detail layout passed across the same window sizes.
- Series detail layout passed across the same window sizes.
- `/favorites`, `/history`, and `/aggregate` personal-route checks completed.
- Search completed.
- The detail play click now hit `BUTTON.hero__play`; the previous `SECTION.hero` hit-target failure did not recur.

## Remaining Failures

- The player opened `/player/21648?...` from the real detail page, but did not expose a playback state after waiting.
- Player duration stayed unknown.
- Delayed player screenshot remained black/blank.
- No native mpv/video aspect evidence was available at the initial player size.
- Resize checks at `1366x768`, `960x600`, and `760x430` remained black/blank and had no video aspect evidence.
- Seek-back was skipped because the player never became ready.
- Runtime cleanup reported `electronExited=false` even though `beforeCount=0` and `remainingCount=0`; the smoke still marks this as a cleanup failure.
- Diagnostics included repeated `mpv ipc write failed: pipe is being closed` warnings, suggesting the embedded mpv IPC/session is closing before the frontend can read playback state.

## Cleanup

- Temporary credential input was removed.
- Temporary real-smoke artifact directory did not exist after the run.
- Follow-up process check found no `emby-player.exe` or `mpv.exe`.

## Next

- Investigate the backend/frontend player startup path for item `21648`, focusing on why mpv IPC closes before state is exposed.
- Continue treating full playback as failing until a real-account full smoke passes with visible embedded frame evidence.
