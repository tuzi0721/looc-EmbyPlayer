# 2026-06-04 12:00 - mpv config isolation window guard

## Changed

- `src-tauri/src/mpv/ipc.rs`
  - Starts the bundled mpv IPC backend with `--no-config` so machine-local mpv config files cannot override app playback flags such as `--wid` and `--force-window=no`.
- `scripts/real-server-visual-smoke.mjs`
  - Top-level playback window enumeration now records native window class names.
  - Playback-window conflict detection now treats any visible top-level mpv process/window/class or `hills-lite-mpv` IPC command line as a failure, even if the window title is also `Hills Lite`.

## Verification

- `node --check scripts\real-server-visual-smoke.mjs`
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `git diff --check`
- `npm.cmd run build`
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- `npm.cmd run tauri:build`
- Real-account Tauri release command-only playback smoke with fixed real item `21648`:
  - `ok=true`, `failures=[]`
  - server detected as Emby
  - PlaybackInfo selected `DirectPlay`
  - selected media source reported `supportsTranscoding=false`
  - mpv exposed real duration, tracks, H.264 video, AAC audio, video params, and video output params
  - native playback capture used the app-owned native child hwnd with `mode=wid` and `hostKind=native-child`
  - top-level window list contained one main `Hills Lite` Tauri window and no mpv top-level window
  - cleanup detached the embedded host and ended with `mpvProcessCount=0`

## Artifacts

- Current release exe: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Size: `8,700,416` bytes
- Last write: `2026/6/4 11:57:34`
- Temporary smoke input, artifact directory, and generated frame screenshots were removed after validation.

## Next

- Continue the remaining user-visible issues, prioritizing a full-flow playback/window smoke and settings/server-management verification instead of relying only on the fixed-item command path.
