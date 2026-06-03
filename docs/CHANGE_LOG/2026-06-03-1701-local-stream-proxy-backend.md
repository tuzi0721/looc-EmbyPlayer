# 2026-06-03 17:01 local stream proxy backend

## Changed
- Added a Tauri backend `stream_proxy` module with a short-lived `127.0.0.1` HTTP endpoint.
- The proxy registers authenticated real-server stream URLs internally and forwards bytes to mpv with Range support.
- Routed `play` through the proxy before `MpvCommand::Load`.
- Routed `get_playback_source` through the proxy as well so the HTML fallback path does not receive the real stream URL or auth headers.
- Cleared stream proxy routes during app playback shutdown.

## Privacy / safety
- Real stream URLs, tokens, and auth headers stay inside the backend proxy route.
- Frontend playback results now receive a local proxy URL and empty playback headers on these paths.
- Server transcoding remains disabled; the proxy only forwards direct stream bytes for local decoding.

## Verification
- Passed: `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- Passed: `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`
- No screenshots were used.

## Remaining
- Build the release exe.
- Run the real-account command-only smoke against the release exe and confirm whether embedded mpv reaches a non-empty state.
