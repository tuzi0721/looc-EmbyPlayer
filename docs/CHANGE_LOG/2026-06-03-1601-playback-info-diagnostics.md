# 2026-06-03 16:01 - playback info diagnostics in backend play

## Scope

- Added backend visual-smoke diagnostics around the `play` command's PlaybackInfo step.
- Logs now include selected line id/status, `play:playback-info-start`, success media source count, or a short sanitized error.
- Added a local sanitizer so URLs/tokens are not written into diagnostics.

## Verification

- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## Result

- Rust verification passed.
- The next real command-only run should reveal why `play` stops after `play:item-ready`.
