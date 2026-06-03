# 2026-06-03 08:23 - Tauri embedded release rebuild

## Changed

- Rebuilt the Tauri release executable after embedded-backend lockdown, frontend IPC UI cleanup, real-smoke embedded assertion, and process-level mpv shutdown wiring.

## Verification

- `cargo build --manifest-path src-tauri\Cargo.toml --release --features mpv-embedded --offline`

## Artifact

- `src-tauri\target\release\emby-player.exe`
- Timestamp: `2026/6/3 08:22:53`
- Size: `8,149,504` bytes
- Required same-directory runtime DLLs confirmed:
  - `libmpv-2.dll`
  - `d3dcompiler_43.dll`

## Result

The release exe is refreshed and ready for real-server visual smoke. No playback pass is claimed until the real-account smoke confirms embedded video, controls, resize/fullscreen behavior, and cleanup.
