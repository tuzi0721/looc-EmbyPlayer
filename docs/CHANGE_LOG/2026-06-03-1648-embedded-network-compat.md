# 2026-06-03 16:48 - embedded mpv network compatibility settings

## Scope

- Added embedded libmpv network compatibility settings for direct private-server streams:
  - `tls-verify=false`
  - `network-timeout=10`
- This keeps playback local and does not enable server transcoding.

## Verification

- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## Result

- Rust verification passed.
- The next real command-only run should show whether HTTPS/TLS handling was the cause of `MPV_ERROR_LOADING_FAILED`.
