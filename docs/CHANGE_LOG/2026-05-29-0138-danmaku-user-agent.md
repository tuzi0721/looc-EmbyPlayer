# Danmaku User-Agent

- **Time**: 2026-05-29 01:38 (UTC+8)
- **Motivation**: move the danmaku roadmap forward by making provider requests identify Hills Lite consistently instead of relying on reqwest defaults.
- **Changed files**:
  - `src-tauri/src/danmaku/mod.rs` - add the shared danmaku User-Agent constant.
  - `src-tauri/src/danmaku/dandanplay.rs` - send User-Agent and JSON Accept headers for DanDanPlay match and comment requests.
  - `docs/CURRENT_STATE.md` - record the danmaku provider request-header increment.
- **Risk**: low. DanDanPlay requests now include explicit headers; response parsing and matching behavior are otherwise unchanged.
- **Rollback**: revert this changelog, the danmaku header additions, and the `CURRENT_STATE.md` update.
- **Verification**:
  1. `cargo check --manifest-path src-tauri/Cargo.toml --all-targets`
  2. `rg -n "[ \t]+$" src-tauri/src/danmaku/mod.rs src-tauri/src/danmaku/dandanplay.rs docs/CURRENT_STATE.md docs/CHANGE_LOG/2026-05-29-0138-danmaku-user-agent.md`
- **Result**: passed.
