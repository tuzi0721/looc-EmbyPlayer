# Detail decode resilience and player UI pass

- **Time**: 2026-05-28 14:10 (UTC+8)
- **Motivation**: fix series detail pages failing on Emby/Jellyfin responses where normally string fields are returned as objects/numbers/booleans, and address the player page feeling empty or poorly scaled on larger displays.
- **Changed files**:
  - `src-tauri/src/emby/models.rs` - add tolerant string, number, and boolean deserializers for common Emby/Jellyfin fields and string arrays, including `Genres` and `BackdropImageTags`.
  - `src/views/DetailView.vue` - replace full raw backend errors with a concise user-facing error state and a bounded/collapsed technical preview.
  - `src/views/PlayerView.vue` - show current media backdrop/poster art behind the external mpv control surface and center playback controls within a wide-screen max width.
  - `src/styles/theme.css` - make shared content padding responsive with a capped `clamp(...)`.
  - `docs/CURRENT_STATE.md` - record the detail decode and player UI fix as the latest project state.
- **Risk**: medium. Tolerant decoding prevents hard failures but may drop object/array fields that do not expose a recognizable `Name`/`Title`/`Value`/`DisplayName`/`Id`; numeric and boolean string values are normalized before reaching the UI. The UI changes are layout-only and keep existing controls intact.
- **Rollback**: revert the files above and restore `docs/CURRENT_STATE.md` to `2026-05-28-1345-emby-json-identity-encoding.md`.
- **Verification**:
  1. `npm.cmd run build`
  2. `cargo check --manifest-path src-tauri/Cargo.toml --all-targets`
  3. `git diff --check -- src-tauri/src/emby/models.rs src/views/DetailView.vue src/views/PlayerView.vue src/styles/theme.css`
  4. `npm.cmd run tauri:build`
- **Result**: passed. Release executable rebuilt at `src-tauri/target/release/emby-player.exe`.
