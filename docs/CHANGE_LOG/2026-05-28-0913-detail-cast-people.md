# Detail cast people

- **Time**: 2026-05-28 09:13 (UTC+8)
- **Motivation**: finish the detail page cast section so item pages show real people data instead of hiding an empty placeholder.
- **Changed files**:
  - `src-tauri/src/emby/models.rs` - deserialize the existing `People` field into `MediaPerson` with safe defaults.
  - `src/types/models.ts` - add the frontend `MediaPerson` shape and expose `People` on `MediaItem`.
  - `src/views/DetailView.vue` - show a horizontal cast list with avatar images, initials fallback, names, and roles using the item detail response already loaded by the page.
  - `docs/CURRENT_STATE.md` - record the cast section update and remove the completed Phase 2 item.
- **Risk**: low. The detail request already asks for `People`; missing or partial people/image data falls back to an omitted section or initials.
- **Rollback**: remove the `People` model fields and restore the hidden cast placeholder, then revert this changelog entry and the `CURRENT_STATE.md` update.
- **Verification**:
  1. `npm.cmd run build`
  2. `cargo check --manifest-path src-tauri/Cargo.toml --all-targets`
  3. `git diff --check`
- **Result**: passed.
