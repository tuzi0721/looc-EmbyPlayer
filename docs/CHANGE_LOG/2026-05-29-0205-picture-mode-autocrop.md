# Picture mode autocrop

- **Time**: 2026-05-29 02:05 (UTC+8)
- **Motivation**: turn the player settings menu's placeholder zoom entry into usable session-level picture modes, including an automatic black-bar reduction mode.
- **Changed files**:
  - `src/types/models.ts`, `src/api/index.ts`, `src/stores/player.ts` - add the shared `PictureMode` type and `setPictureMode` player API.
  - `src/views/PlayerView.vue` - replace the placeholder zoom item with fit/fill/stretch/autocrop controls, apply the active mode after playback starts and after queue navigation, and mirror the modes for the HTML fallback video element.
  - `electron/main.mjs` - add `set_picture_mode` and map picture modes to mpv `keepaspect`, `panscan`, `video-zoom`, scale, and aspect properties.
  - `src-tauri/src/mpv/backend.rs`, `src-tauri/src/mpv/ipc.rs`, `src-tauri/src/mpv/embedded.rs`, `src-tauri/src/mpv/mod.rs` - add `PictureMode` and implement the same mpv property mapping for both Tauri mpv backends.
  - `src-tauri/src/commands/player.rs`, `src-tauri/src/lib.rs` - expose the Tauri `set_picture_mode` command.
  - `docs/CURRENT_STATE.md` - record this player picture-mode increment.
- **Risk**: medium. The current autocrop mode uses mpv zoom/panscan to reduce common letterbox bars; it is session-level and does not yet run a cropdetect feedback loop.
- **Rollback**: revert this changelog, the picture-mode API/backend command changes, the player menu changes, and the `CURRENT_STATE.md` update.
- **Verification**:
  1. `node --check electron/main.mjs`
  2. `npm.cmd run build`
  3. `cargo check --manifest-path src-tauri/Cargo.toml --all-targets`
  4. `rg -n "[ \t]+$" electron/main.mjs src/types/models.ts src/api/index.ts src/stores/player.ts src/views/PlayerView.vue src-tauri/src/mpv/backend.rs src-tauri/src/mpv/ipc.rs src-tauri/src/mpv/embedded.rs src-tauri/src/mpv/mod.rs src-tauri/src/commands/player.rs src-tauri/src/lib.rs docs/CURRENT_STATE.md docs/CHANGE_LOG/2026-05-29-0205-picture-mode-autocrop.md`
  5. `npm.cmd run electron:build`
- **Result**: passed.
