# 2026-06-03 23:29 - Playback Unready Diagnostics

## Summary
- Added targeted diagnostics for the real black-screen class of playback failures.
- `MpvSnapshot` now carries safe readiness fields such as `idleActive`, `demuxer`, `fileFormat`, stream-path presence, playlist position/count, and demuxer cache state when available.
- The local stream proxy now writes redacted visual-smoke entries for each playback request: route id prefix, method, Range usage, upstream status, content type, content length, and bytes sent.
- The real command-only verifier now includes these mpv fields in the unready failure line instead of only saying that video state did not become ready.

## Verification
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`
- `npm.cmd run build`
- `node --check scripts\real-server-visual-smoke.mjs`
- `git diff --check`

## Next
- Rebuild the packaged release and rerun the real-account command-only playback guard so the next failure points to proxy/upstream/mpv readiness instead of staying opaque.
