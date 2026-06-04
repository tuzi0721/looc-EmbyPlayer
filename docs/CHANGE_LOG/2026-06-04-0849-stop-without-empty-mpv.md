# 2026-06-04 08:49 - Stop without empty mpv window

## Changed

- `src-tauri/src/mpv/ipc.rs`
  - Changed IPC `MpvCommand::Stop` so it no longer calls the normal command path that auto-starts mpv when there is no active child process.
  - If an existing IPC session is stale during stop, the backend shuts it down instead of creating a new idle player.
- `scripts/real-server-visual-smoke.mjs`
  - Kept real selected movie/series names in setup output so later search/detail probes do not depend on fragile page globals.
  - Made personal-route image checks wait for loaded/broken image state before judging `/favorites`, `/history`, and `/aggregate`.
  - Made detail play probes wait for a stable hit target and report when the button center is still blocked.
  - Replaced top-level playback-window detection with full `EnumWindows` enumeration over the launched process tree, including hwnd, parent hwnd, style, exStyle, title, process, command line, and rect. This catches both separate `mpv.exe` windows and extra top-level windows from the app process.

## Verification

- Passed:
  - `node --check scripts\real-server-visual-smoke.mjs`
  - `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
  - `git diff --check`
  - `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
  - `npm.cmd run build`
  - `npm.cmd run tauri:build`
- New release exe built:
  - `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
  - Tauri package integrity passed with 7 bundled mpv files.
- Real-account full Tauri release smoke was rerun against the provided two lines and test account.
  - Login/server detection succeeded; line 2 was healthy Emby, line 1 was down.
  - Selected real item: `34535`, DirectPlay MP4 H.264/AAC, `supportsTranscoding=false`.
  - The previous user-visible extra-window class improved: the final failure list no longer contained separate top-level `mpv` or multiple `Hills Lite` playback-window failures.
  - The run still failed and is not a playback pass.

## Remaining Failures Observed

- Home layout still exposes only one media section, so the full-smoke "second row exposed" check fails at every tested home viewport.
- Series/detail play button center is still blocked by `SECTION.hero`; CDP click misses and only the DOM fallback opens the player.
- The selected full-flow item `34535` entered the player with no exposed mpv playback state, no duration, no video-ready evidence, and skipped seek-back.
- Runtime cleanup still reports `electronExited=false` for the Tauri full-smoke `window.close()` path, even though `beforeCount=0`, `remainingCount=0`, final taskkill cleanup succeeded, and a follow-up process check found no `emby-player.exe` or `mpv.exe`.

## Cleanup

- Temporary credential input was removed.
- The reported smoke artifact directory no longer existed after the run.
- Follow-up process check found no `emby-player.exe` or `mpv.exe`.

## Next

- Fix the detail hero hit target so real pointer clicks land on the play button.
- Treat known non-streamable MP4/Range-broken playback as a clear blocked state before entering a black/no-state player.
- Adjust home full-smoke expectations or UI layout for the single-row library state without losing the user's requirement that the next content row remain visible.
