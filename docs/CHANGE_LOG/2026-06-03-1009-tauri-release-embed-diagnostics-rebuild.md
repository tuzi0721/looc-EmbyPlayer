# 2026-06-03 10:09 - Tauri release rebuild with embed diagnostics

## Changed

- Rebuilt the Tauri `mpv-embedded` release after adding embedded attach diagnostics and frontend timeout guards.

## Verification

- `cargo build --manifest-path src-tauri\Cargo.toml --release --features mpv-embedded --offline`

## Artifact

- `src-tauri\target\release\emby-player.exe`
- Timestamp: `2026/6/3 10:09:07`
- Size: `8,148,992` bytes
- Same-directory runtime DLLs confirmed:
  - `libmpv-2.dll`
  - `d3dcompiler_43.dll`

## Result

The release exe is refreshed for the next real-account smoke. Playback is still unverified until the new smoke completes.
