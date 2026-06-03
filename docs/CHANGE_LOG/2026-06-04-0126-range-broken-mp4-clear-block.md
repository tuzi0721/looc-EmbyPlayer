# 2026-06-04 01:26 - Range Broken MP4 Clear Block

## Summary
- Added a backend guard for Range-broken MP4/M4V/MOV sources.
- After Range preflight fails, playback now reads only the first 2 MiB of the upstream stream and checks for `moov` / `moof` metadata.
- If the stream has no playable prefix metadata, playback stops before mpv load and returns a clear local-decode error instead of entering a black player state.
- The guard keeps `EnableTranscoding=false`; it does not request server decoding or server transcoding.

## Verification
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `node --check scripts\real-server-visual-smoke.mjs`
- `git diff --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`
- `npm.cmd run build`

## Next
- Rebuild the packaged release.
- Rerun the real-account command-only guard and confirm the sampled MP4 fails clearly before mpv load, with no external window or residual mpv process.
