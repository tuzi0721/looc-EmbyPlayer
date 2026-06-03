# 2026-06-03 10:52 - Tauri native embedded revert IPC fallback

## Changed

- Removed the Tauri `Embedded` backend routing through bundled `mpv.exe` IPC because it produced a separate idle top-level mpv-style window.
- Restored the `Embedded` backend to the real libmpv backend.
- Changed libmpv back to a single persistent mpv instance created at app startup; attaching now creates a native child host and sets `wid` on the existing mpv instance instead of constructing libmpv with `wid` during `embed_attach`.
- Player teardown now stops playback before detaching the embedded host window, avoiding stop/detach races during route changes and close.

## Verification

- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`
- `npm.cmd run build`

## Result

Static verification passes. A release rebuild is still required before handing over a new exe. No screenshot-based visual smoke was run in this phase after the user asked to stop screenshot attempts.
