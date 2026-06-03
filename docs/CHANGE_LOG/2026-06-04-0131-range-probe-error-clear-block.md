# 2026-06-04 01:31 - Range Probe Error Clear Block

## Summary
- Changed playback-time Range probe errors from "assume seekable" to a clear pre-mpv failure.
- If the stream URL cannot be reached or Range cannot be verified, playback now stops before mpv load instead of entering an idle black player state.
- This keeps server decoding/transcoding disabled and asks the user to retry, switch line, or download first.

## Why
- A real-account command-only run sampled MKV item `21648`.
- The Range probe failed before playback, but the old fallback treated that as `range_supported=true`.
- mpv then loaded a proxy URL whose upstream request failed, leaving no duration/tracks/video even though controls were visible.

## Verification
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`
- `npm.cmd run build`
- `git diff --check`

## Next
- Rebuild the packaged release and rerun real-account validation to confirm probe failures do not enter mpv.
