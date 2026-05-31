# Response compatibility diagnostics

- **Time**: 2026-05-28 08:56 (UTC+8)
- **Motivation**: make Emby and DanDanPlay response handling more tolerant of omitted/null fields while keeping HTTP and JSON parse failures observable enough to diagnose incompatible server responses.
- **Changed files**:
  - `src-tauri/src/danmaku/dandanplay.rs` - add serde defaults for DanDanPlay response fields and include URL, status, and a capped body preview when HTTP or JSON decoding fails.
  - `src-tauri/src/emby/models.rs` - add serde defaults and `null_to_default` handling to commonly unstable Emby response fields such as item lists, user data, playback media sources, media streams, and remote session/play state flags.
  - `docs/CURRENT_STATE.md` - record the response compatibility and diagnostics update as the latest project state.
- **Risk**: low to medium. Defaulting missing/null values avoids crashes but can hide malformed upstream responses by converting them into empty/false values; diagnostic body previews are capped to 1200 characters and newline-escaped to avoid dumping full responses.
- **Rollback**: revert the two Rust files and this changelog entry, then restore `docs/CURRENT_STATE.md` to the previous settings-save-stability entry.
- **Verification**:
  1. `git diff --check -- src-tauri/src/danmaku/dandanplay.rs src-tauri/src/emby/models.rs`
  2. `cargo check --manifest-path src-tauri/Cargo.toml --all-targets` with `CARGO_TARGET_DIR` redirected to the Codex workspace because the sandbox cannot write `src-tauri/target`.
- **Result**: passed.
