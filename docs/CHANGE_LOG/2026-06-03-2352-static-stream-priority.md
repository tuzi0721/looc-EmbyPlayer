# 2026-06-03 23:52 - Static Stream Priority

## Summary
- Changed desktop stream URL priority for local-decode playback.
- Safe container media sources now use the constructed static endpoint `Videos/{id}/stream.{container}` before the server-provided `DirectStreamUrl`.
- `DirectStreamUrl` remains the fallback when a safe container endpoint cannot be built.
- This targets real sources whose server-provided `original.mp4` URL responds to mpv Range requests with `200 OK` instead of `206 Partial Content`.

## Verification
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`
- `npm.cmd run build`
- `git diff --check`

## Next
- Rebuild the packaged release and rerun the real-account command-only playback guard.
