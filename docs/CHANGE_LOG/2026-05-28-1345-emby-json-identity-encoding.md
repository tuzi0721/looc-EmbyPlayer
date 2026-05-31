# Emby JSON identity encoding

- **Time**: 2026-05-28 13:45 (UTC+8)
- **Motivation**: fix series detail failures that surface as `network error: error decoding response body`, especially when larger item detail responses pass through servers or reverse proxies with unreliable gzip/br handling.
- **Changed files**:
  - `src-tauri/src/emby/client.rs` - send `Accept-Encoding: identity` on Emby/Jellyfin JSON API requests so detail/list/playback metadata responses are returned without transport compression.
  - `docs/CURRENT_STATE.md` - record the JSON response decoding compatibility fix as the latest state.
- **Risk**: low. JSON metadata responses become slightly larger on the wire, but avoid a class of compression decode failures before serde can parse or report a body preview.
- **Rollback**: remove the `Accept-Encoding: identity` header insertions from `src-tauri/src/emby/client.rs`, then revert this changelog entry and the `CURRENT_STATE.md` update.
- **Verification**:
  1. `npm.cmd run build`
  2. `cargo check --manifest-path src-tauri/Cargo.toml --all-targets`
  3. `git diff --check`
- **Result**: passed.
