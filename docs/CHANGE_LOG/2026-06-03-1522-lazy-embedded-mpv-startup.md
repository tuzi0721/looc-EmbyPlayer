# 2026-06-03 15:22 Lazy embedded mpv startup

## What changed

- Changed `MpvManager` so `MpvBackendKind::Embedded` no longer constructs libmpv during app startup.
- Embedded mode now keeps a lightweight IPC placeholder during startup and creates `MpvEmbeddedBackend` lazily when `embed_attach` is called.
- When lazy embedded creation succeeds, the active backend switches to the native embedded backend before playback commands run.

## Why

- Real command-only validation repeatedly showed the Tauri WebView stuck at `about:blank` before login/backend requests.
- Startup code forced `mpv_backend=Embedded` and immediately initialized libmpv inside `AppState::initialize`, which can block Tauri setup and prevent the WebView from navigating.

## Verification

- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## Next

- Rebuild the Tauri release.
- Rerun command-only real-server validation without screenshots. Startup should now reach the Vue bridge before playback attempts lazy libmpv creation.
