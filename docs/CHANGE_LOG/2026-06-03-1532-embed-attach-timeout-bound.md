# 2026-06-03 15:32 - bounded Tauri embed attach task

## Scope

- Kept the Tauri native embedded attach path from hanging indefinitely when libmpv/window binding stalls.
- Moved `state.mpv.bind_embedded(parent)` behind a blocking task and wrapped it in an 8 second command timeout.
- Added stage logs for `embed_attach:bind-start`, `embed_attach:complete`, `embed_attach:timeout`, and `embed_attach:error`.

## Verification

- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## Result

- The code compiles with the `mpv-embedded` feature.
- This does not prove playback yet. The next step is rebuilding the packaged release and rerunning the real-server command-only verifier so the failure becomes either a bounded native attach timeout/error or a completed attach.
