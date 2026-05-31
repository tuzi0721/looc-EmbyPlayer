# Auth query toggle

- **Time**: 2026-05-29 01:52 (UTC+8)
- **Motivation**: avoid exposing Emby/Jellyfin tokens in playback URLs by default, while keeping a manual compatibility switch for servers that still require query-string authorization.
- **Changed files**:
  - `electron/backend/store.mjs` - add `appendAuthQuery: false` to persisted default settings.
  - `electron/backend/emby.mjs` - gate `api_key` URL parameters behind `appendAuthQuery`, expose auth mode diagnostics, and return playback headers for mpv/HLS fallback paths.
  - `src/types/models.ts`, `src/stores/settings.ts`, `src/views/SettingsView.vue` - add the `appendAuthQuery` setting and a player settings switch.
  - `src/api/index.ts`, `src/views/PlayerView.vue` - allow HTML/HLS fallback playback to apply returned request headers.
  - `src-tauri/src/config/models.rs`, `src-tauri/src/emby/client.rs` - persist `appendAuthQuery` as `append_auth_query` and omit `api_key` unless enabled.
  - `src-tauri/src/commands/player.rs`, `src-tauri/src/emby/session_controller.rs`, `src-tauri/src/download/engine.rs` - send both `X-Emby-Token` and `Authorization` headers when loading protected streams.
  - `docs/CURRENT_STATE.md` - record this auth-query compatibility increment.
- **Risk**: medium. Default protected stream URLs no longer include `api_key`; playback and downloads now rely on headers unless the compatibility switch is enabled.
- **Rollback**: revert this changelog, the settings/default changes, the URL/header handling updates, and the `CURRENT_STATE.md` entry.
- **Verification**:
  1. `node --check electron/backend/store.mjs`
  2. `node --check electron/backend/emby.mjs`
  3. `npm.cmd run build`
  4. `cargo check --manifest-path src-tauri/Cargo.toml --all-targets`
  5. `rg -n "[ \t]+$" electron/backend/store.mjs electron/backend/emby.mjs src/types/models.ts src/stores/settings.ts src/views/SettingsView.vue src/api/index.ts src/views/PlayerView.vue src-tauri/src/config/models.rs src-tauri/src/emby/client.rs src-tauri/src/commands/player.rs src-tauri/src/emby/session_controller.rs src-tauri/src/download/engine.rs docs/CURRENT_STATE.md docs/CHANGE_LOG/2026-05-29-0152-auth-query-toggle.md`
  6. `npm.cmd run electron:build`
- **Result**: passed.
