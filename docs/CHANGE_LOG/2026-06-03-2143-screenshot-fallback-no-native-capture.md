# 2026-06-03 21:43 - Screenshot fallback without native capture

## Changed
- Added mpv screenshot fallback: if `screenshot-to-file subtitles` fails, the backend retries with `video` mode.
- Removed command-only native-window capture from the playback smoke path after it could hang under real Tauri release validation.
- Kept multi-frame mpv screenshot candidates and route-away cleanup validation.

## Verified
- `node --check scripts\real-server-visual-smoke.mjs`
- `npm.cmd run build`
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## Next
- Rebuild the packaged release and rerun real-account command-only validation against the new executable.
