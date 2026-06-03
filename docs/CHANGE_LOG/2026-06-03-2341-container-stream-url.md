# 2026-06-03 23:41 - Container Stream URL

## Summary
- Changed direct local playback stream URL generation to prefer container-qualified static stream paths.
- When a media source has a safe container name, the desktop backend now builds `Videos/{id}/stream.{container}` instead of the extensionless `Videos/{id}/stream`.
- Web preview uses the same path selection for consistency.
- The old extensionless path remains the fallback when the container is missing or unsafe.
- The change keeps `Static=true` and the no-server-transcode PlaybackInfo contract intact.

## Verification
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`
- `npm.cmd run build`
- `git diff --check`

## Next
- Rebuild the packaged release and rerun the real-account command-only playback guard to see whether Emby/Jellyfin honors Range on the container-qualified static stream path.
