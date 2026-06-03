# 2026-06-03 17:19 nonblocking load readiness

## Changed
- Changed embedded mpv load readiness diagnostics to run on a short background probe after `loadfile` succeeds.
- The probe only takes the mpv mutex briefly per poll instead of holding it for the full readiness window.
- `play`, `get_state`, and `stop` can remain responsive while the stricter video evidence check continues in the background.

## Verification
- Passed: `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- Passed: `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`
- No screenshots were used.

## Next
- Rebuild the release exe.
- Rerun real-account strict command-only smoke.
