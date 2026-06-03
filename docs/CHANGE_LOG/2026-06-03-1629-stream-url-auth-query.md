# 2026-06-03 16:29 - stream URL auth query for direct playback

## Scope

- Changed backend stream URL generation to always append `api_key` for direct playback/download stream URLs.
- Kept Authorization and token headers in place, but no longer depends on libmpv accepting header-list formatting for stream authentication.
- Removed the unused settings variable after the change.

## Verification

- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## Result

- Rust verification passed without warnings.
- The next real command-only run should show whether mpv can open the direct stream instead of returning `MPV_ERROR_LOADING_FAILED`.
