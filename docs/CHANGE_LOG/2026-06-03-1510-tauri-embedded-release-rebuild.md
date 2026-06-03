# 2026-06-03 15:10 Tauri embedded release rebuild

## What changed

- Added Cargo `default-run = "emby-player"` so Tauri selects the real app binary instead of `electron_mpv_host`.
- Rebuilt the Tauri release with `npm.cmd run tauri:build`, now using `--features mpv-embedded`.

## Verification

- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`
- `npm.cmd run tauri:build`
- `npm.cmd run check:tauri-package`

## Artifact evidence

- `src-tauri\target\release\emby-player.exe`: `8,531,456` bytes, timestamp `2026/6/3 15:05:32`.
- `src-tauri\target\release\electron_mpv_host.exe`: `339,456` bytes, timestamp `2026/6/3 15:03:55`.
- Package check passed with frontend dist and bundled mpv runtime present.

## Next

- Run real-account command-only validation against this exact release exe without screenshot capture.
