# 2026-06-03 16:21 - embedded mpv header fields format

## Scope

- Changed embedded libmpv `http-header-fields` formatting from one CRLF-joined string to comma-separated header fields, matching the mpv CLI/external-player format.
- Sanitized header values by replacing CR/LF before sending them to mpv.
- Kept credentials out of diagnostics and logs.

## Verification

- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## Result

- Rust verification passed.
- The next real command-only run should show whether mpv can open authenticated direct streams instead of failing with `MPV_ERROR_LOADING_FAILED`.
