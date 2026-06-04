# 2026-06-04 10:49 - Embedded playback full smoke pass

## Changed

- `src-tauri/src/commands/player.rs`
  - Playback now keeps all viable playback-line candidates instead of collapsing to one line before mpv load.
  - Each candidate is registered through the local stream proxy and loaded into mpv one at a time.
  - A line is accepted only after mpv exposes real media state within the ready wait window.
  - If resume/start time prevents readiness, the same line retries once from zero before falling back.
  - If no line becomes ready, the error remains a local-decode/direct-play failure and does not ask the server to transcode.
- `src-tauri/src/mpv/ipc.rs`
  - The IPC mpv backend now refuses to start unless the app-owned native child host is attached.
  - mpv launch always uses `--wid=<host>` and `--force-window=no`; the old no-host `--force-window=yes` standalone-window fallback is removed.
- `src/views/PlayerView.vue`
  - Native seek nudges now go through the same absolute seek path as the progress bar, so disabled/non-seekable state is respected consistently.
- `scripts/real-server-visual-smoke.mjs`
  - Full smoke now waits through slow real startup, retries a dark first frame by seeking into the content, and captures the native child layer for visual evidence.
  - Runtime cleanup first asks the page to close, then uses the native window close path before checking child playback processes.
  - Player controls now report `disabled`, and non-Range seek buttons are treated as expected disabled controls instead of a seek-back failure.
  - Server detection no longer hard-codes a single line as the only valid Emby/Jellyfin result.

## Verification

- Passed:
  - `node --check scripts\real-server-visual-smoke.mjs`
  - `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
  - `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
  - `git diff --check`
  - `npm.cmd run build`
  - `npm.cmd run tauri:build`
- Rebuilt release exe:
  - `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
  - Size: `8,693,760` bytes
  - Last write: `2026/6/4 10:45:56`
- Real-account Tauri release full smoke passed:
  - `ok=true`
  - `failures=[]`
  - Login/server detection succeeded against the real account.
  - The run selected real movie item `21648`.
  - PlaybackInfo was `DirectPlay` and `supportsTranscoding=false`.
  - Selected real media was MKV H.264/AAC, `1440x1080`, 4:3.
  - Playback became ready after the delayed wait with real mpv state and tracks.
  - Native capture used the app-owned child hwnd: `mode=wid`, `hostKind=native-child`, process `emby-player.exe`.
  - Player aspect evidence passed at initial capture and after `1366x768`, `960x600`, and `760x430` resizes.
  - The real source was non-Range; seek back/forward controls were disabled and were not treated as broken seek behavior.
  - Fullscreen check passed.
  - Runtime cleanup passed with `electronExited=true`, `remainingCount=0`, and no remaining playback child processes.

## Cleanup

- Temporary credential input file was removed.
- Temporary real-smoke artifact directory was removed.
- Follow-up process check found no `emby-player.exe` or `mpv.exe`.

## Next

- Commit and push this verified playback phase.
- Continue the next unresolved user-visible issues from the list, with the same real-account and multi-size validation discipline.
