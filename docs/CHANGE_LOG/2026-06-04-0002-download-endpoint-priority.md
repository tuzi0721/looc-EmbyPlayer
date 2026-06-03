# 2026-06-04 00:02 - Download Endpoint Priority

## Summary
- Changed DirectPlay URL selection again after the real static stream endpoint still returned `200 OK` for Range requests.
- Safe DirectPlay media sources now try the original-file endpoint `Items/{id}/Download` before stream endpoints.
- This keeps decoding local: it does not request server transcoding, video stream copy, or audio stream copy work from the server.
- Stream endpoints and `DirectStreamUrl` remain fallbacks.

## Verification
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`
- `npm.cmd run build`
- `git diff --check`

## Next
- Rebuild the packaged release and rerun the real-account command-only playback guard.
