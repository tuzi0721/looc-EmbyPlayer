# 2026-06-03 16:38 - prefer server DirectStreamUrl

## Scope

- Added `MediaSource.DirectStreamUrl` to the Rust Emby/Jellyfin model.
- Stream URL generation now prefers the server-provided direct stream URL when present.
- Relative direct stream URLs are resolved against the selected line base URL.
- Missing `MediaSourceId`, `PlaySessionId`, `api_key`, and `Static` query parameters are still appended.

## Verification

- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## Result

- Rust verification passed.
- The next real command-only run should show whether using the server-provided direct stream URL avoids `MPV_ERROR_LOADING_FAILED`.
