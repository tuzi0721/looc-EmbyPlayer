# Collection card adaptive aspect

- **Time**: 2026-05-29 02:16 (UTC+8)
- **Motivation**: let media collection cards render correctly whether the server provides portrait or landscape collection artwork.
- **Changed files**:
  - `src/components/common/PosterCard.vue` - add auto aspect resolution for `BoxSet` cards using `PrimaryImageAspectRatio`, keep normal movie/series defaults unchanged, and preserve primary artwork for collections even when rendered landscape.
  - `src/types/models.ts`, `electron/backend/emby.mjs`, `src-tauri/src/emby/models.rs` - carry `PrimaryImageAspectRatio` through Electron and Tauri models.
  - `src/views/LibraryView.vue` - include `BoxSet` in media library item listings.
  - `electron/backend/emby.mjs`, `src-tauri/src/emby/client.rs` - request `PrimaryImageAspectRatio` for search results so collection cards can adapt outside library pages too.
  - `docs/CURRENT_STATE.md` - record this collection-card increment.
- **Risk**: low. The change is scoped to card layout and item field hydration; non-collection cards keep the existing portrait default unless an explicit aspect prop is passed.
- **Rollback**: revert this changelog, the card/model/listing updates, and the `CURRENT_STATE.md` entry.
- **Verification**:
  1. `node --check electron/backend/emby.mjs`
  2. `npm.cmd run build`
  3. `cargo check --manifest-path src-tauri/Cargo.toml --all-targets`
  4. `rg -n "[ \t]+$" src/components/common/PosterCard.vue src/views/LibraryView.vue src/types/models.ts electron/backend/emby.mjs src-tauri/src/emby/models.rs src-tauri/src/emby/client.rs docs/CURRENT_STATE.md docs/CHANGE_LOG/2026-05-29-0216-collection-card-adaptive.md`
  5. `npm.cmd run electron:build`
- **Result**: passed.
