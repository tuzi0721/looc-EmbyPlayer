# 2026-06-03 10:17 - Tauri embedded IPC window host

## Changed

- Kept the user-facing `Embedded` backend contract for Tauri builds, but route it through the bundled `mpv.exe` IPC implementation with `--wid`.
- This avoids the libmpv `wid` initializer hang observed after `embed_attach:parent-ready`.
- When the IPC backend rebinds an embedded host window, it now stops any existing mpv child process before destroying the old host window so future playback cannot render into a stale native handle.
- Marked the retained libmpv constructor as an explicit unused fallback to keep the check output clean.

## Verification

- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## Result

Rust verification passes cleanly. Playback is still not visually passed until the release exe is rebuilt and the real-account visual smoke captures actual embedded playback.
