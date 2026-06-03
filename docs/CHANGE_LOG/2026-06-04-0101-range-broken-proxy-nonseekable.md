# 2026-06-04 01:01 - Range Broken Proxy Nonseekable

## Summary
- Updated the local stream proxy so Range-broken upstreams are no longer exposed to mpv as Range-capable streams.
- `play` now registers proxy routes with the real Range preflight result.
- When `range_supported=false`, the proxy:
  - suppresses the client `Range` header before requesting upstream
  - logs the suppressed Range value in redacted visual-smoke diagnostics
  - removes `Accept-Ranges` and `Content-Range` from the response to mpv
- This keeps server transcoding disabled; it only changes how the local proxy presents a broken direct stream to mpv.

## Verification
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `node --check scripts\real-server-visual-smoke.mjs`
- `git diff --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`
- `npm.cmd run build`

## Next
- Rebuild the packaged release.
- Rerun the real-account command-only playback guard on the sampled MP4 class.
