# 2026-06-04 00:20 - Range Preflight HTTP Seekable

## Summary
- Added playback-time Range preflight for remote local-decode streams.
- Before registering the local stream proxy route, playback now probes the chosen upstream URL with `Range: bytes=0-0`.
- If the upstream returns `206 Partial Content` with `Content-Range`, mpv keeps normal HTTP seek auto-detection.
- If the upstream returns a non-206 response, mpv loads the local proxy URL with `http-seekable=no` so broken Range servers are read sequentially instead of falling into the mpv idle retry loop.
- Removed the failed DirectPlay download-endpoint priority; safe container sources use the no-transcode stream endpoint again.

## Verification
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`
- `npm.cmd run build`
- `git diff --check`

## Next
- Rebuild the packaged release and rerun the real-account command-only playback guard.
