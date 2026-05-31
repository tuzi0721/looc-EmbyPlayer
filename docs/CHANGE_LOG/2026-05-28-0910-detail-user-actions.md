# Detail user actions

- **Time**: 2026-05-28 09:10 (UTC+8)
- **Motivation**: make the detail page action buttons behave like real media controls instead of passive visual badges.
- **Changed files**:
  - `src-tauri/src/emby/endpoints.rs`, `src-tauri/src/emby/client.rs` - add Emby/Jellyfin favorite and played item endpoints using `POST`/`DELETE`, returning updated `UserData` and falling back to reloading the item when the server returns an empty success body.
  - `src-tauri/src/commands/media.rs`, `src-tauri/src/lib.rs` - expose `set_item_favorite` and `set_item_played` Tauri commands.
  - `src/api/index.ts`, `src/stores/library.ts` - add frontend API calls and a cache update helper for item user data across detail, search, resume, and parent item lists.
  - `src/views/DetailView.vue` - wire the favorite and played buttons with loading states, optimistic cache updates, error messages, and rollback reloads.
  - `docs/CURRENT_STATE.md` - record the detail action update as the latest state and remove the completed Phase 2 item.
- **Risk**: medium. Emby and Jellyfin share these user-data endpoints, but individual servers may return either `UserData` JSON or an empty success body; both paths are handled.
- **Rollback**: remove the two commands/API calls, restore the detail buttons to passive controls, and revert this changelog entry plus the `CURRENT_STATE.md` update.
- **Verification**:
  1. `npm.cmd run build`
  2. `cargo check --manifest-path src-tauri/Cargo.toml --all-targets`
  3. `git diff --check`
- **Result**: passed.
