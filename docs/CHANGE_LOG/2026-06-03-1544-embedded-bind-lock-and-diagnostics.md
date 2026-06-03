# 2026-06-03 15:44 - embedded bind lock split and diagnostics

## Scope

- Split Tauri embedded mpv lazy creation/binding out of the manager write-lock path.
- Added visual-smoke diagnostics inside native mpv initialization, event thread creation, host window creation, and `wid` binding.
- Kept diagnostics URL-free and credential-free.

## Verification

- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## Result

- Rust verification passed.
- The next real command-only run should identify the specific native phase that hangs instead of only reporting `embed_attach:bind-start`.
