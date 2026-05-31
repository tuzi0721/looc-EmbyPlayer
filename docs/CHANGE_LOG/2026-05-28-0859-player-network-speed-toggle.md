# Player network speed toggle

- **Time**: 2026-05-28 08:59 (UTC+8)
- **Motivation**: match the Hills Lite player reference more closely by making the upper-right network speed indicator available only when the user enables it.
- **Changed files**:
  - `src-tauri/src/config/models.rs` - add the persisted `showNetworkSpeed` setting with a default of `false`.
  - `src-tauri/src/commands/settings.rs` - accept `showNetworkSpeed` in settings patches without triggering an MPV rebuild.
  - `src-tauri/src/mpv/backend.rs`, `src-tauri/src/mpv/ipc.rs`, `src-tauri/src/mpv/embedded.rs` - expose MPV `cache-speed` as optional `networkBps` in playback snapshots.
  - `src/types/models.ts`, `src/stores/settings.ts`, `src/views/SettingsView.vue` - add the frontend setting and switch control.
  - `src/views/PlayerView.vue` - show a compact MB/s indicator with recent activity bars in the player top-right controls when enabled.
  - `docs/CURRENT_STATE.md` - record the player usability update as the latest state.
- **Risk**: low to medium. The MPV property may be unavailable for local files or some streams, so the UI falls back to `0.0 MB/s`; the setting defaults off to avoid adding visual noise.
- **Rollback**: remove the setting, snapshot field, player meter, and this changelog entry, then restore `docs/CURRENT_STATE.md` to the previous response compatibility entry.
- **Verification**:
  1. `npm.cmd run build`
  2. `cargo check --manifest-path src-tauri/Cargo.toml --all-targets`
- **Result**: passed.
