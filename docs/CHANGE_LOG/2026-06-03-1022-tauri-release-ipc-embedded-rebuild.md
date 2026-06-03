# 2026-06-03 10:22 - Tauri release rebuild with IPC embedded host

## Changed

- Rebuilt the Tauri `mpv-embedded` release after routing the `Embedded` backend through the bundled mpv IPC `--wid` host path.

## Verification

- `cargo build --manifest-path src-tauri\Cargo.toml --release --features mpv-embedded --offline`

## Artifact

- `src-tauri\target\release\emby-player.exe`
- Timestamp: `2026/6/3 10:22:23`
- Size: `8,128,512` bytes
- Same-directory runtime DLLs confirmed:
  - `libmpv-2.dll`
  - `d3dcompiler_43.dll`

## Result

The release exe now contains the IPC embedded host fallback. Playback is still not visually passed until the real-account smoke captures delayed embedded playback and cleanup evidence.
