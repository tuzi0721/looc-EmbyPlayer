# 2026-06-03 12:14 release event diagnostics build

## Scope

- Rebuilt the Tauri release executable after adding native libmpv event diagnostics.
- Did not run screenshot or visual capture checks in this phase.

## Verification

- `cargo build --manifest-path src-tauri\Cargo.toml --release --features mpv-embedded --offline`

## Artifact

- `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Last write time: `2026/6/3 12:14:05`
- Size: `8,158,208` bytes
- Same-directory runtime DLLs present: `libmpv-2.dll`, `d3dcompiler_43.dll`

## Result

The latest release now contains the embedded mpv event diagnostics. Next phase is a real-account command-only smoke against this exact exe.
