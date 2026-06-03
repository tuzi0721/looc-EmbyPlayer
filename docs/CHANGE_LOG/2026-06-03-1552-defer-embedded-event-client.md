# 2026-06-03 15:52 - defer embedded mpv event client

## Scope

- Removed secondary mpv event-client creation from the synchronous embedded attach initialization path.
- Kept direct mpv state reads available through the main mpv handle.
- Kept the deferred event-thread helper code for future non-blocking diagnostics, but silenced dead-code warnings while it is not active.

## Verification

- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## Result

- Rust verification passed without warnings.
- The next real command-only run should pass the previous `mpv:new:event-thread-start` blocker and either reach host creation/`wid` binding or expose the next native attach/load blocker.
