# 2026-06-03 17:10 command-only video readiness tighten

## Changed
- Tightened embedded mpv load diagnostics:
  - `load-ready` is now reserved for video-side evidence (`video-codec`, `video-params`, or `video-out-params`).
  - Container-only readiness is logged as `load-partial` when duration/tracks exist but video evidence is still missing.
- Tightened command-only smoke readiness:
  - It now keeps polling instead of passing immediately on duration or track count.
  - It reports video track count, video track codecs, video evidence, and position.
  - It fails with `mpv video state did not become ready` when only weak container evidence is present.

## Verification
- Passed: `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- Passed: `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`
- Passed: `node --check scripts\real-server-visual-smoke.mjs`
- No screenshots were used.

## Next
- Rebuild the release exe with the stricter backend diagnostics.
- Rerun real-account command-only smoke against the stricter verifier.
