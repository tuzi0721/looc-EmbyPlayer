# PDP studios and bitrate sort

- **Time**: 2026-05-29 01:31 (UTC+8)
- **Motivation**: continue the online-media and PDP roadmap with two concrete user-facing increments: expose production studios on detail pages without wrapping the hero layout, and add bitrate sorting to Emby/Jellyfin media libraries.
- **Changed files**:
  - `electron/backend/emby.mjs` - request and normalize `Studios` from Emby/Jellyfin detail responses.
  - `src-tauri/src/emby/client.rs` and `src-tauri/src/emby/models.rs` - keep the legacy Tauri path compatible with the same `Studios` field.
  - `src/types/models.ts` - add `Studios` to the shared media item type.
  - `src/views/DetailView.vue` - show production studios as a single-line row in the hero and fold overflow studios into a floating popover.
  - `src/views/LibraryView.vue` - add `Bitrate` to the media-library sorting options.
  - `docs/CURRENT_STATE.md` - record the PDP studio row and bitrate sort increment.
- **Risk**: low. The new detail field is optional and tolerant of missing or null data; bitrate sorting relies on Emby/Jellyfin accepting `SortBy=Bitrate`.
- **Rollback**: revert this changelog, the `Studios` model/request additions, the detail-page studio UI, the library sort option, and the `CURRENT_STATE.md` update.
- **Verification**:
  1. `node --check electron/backend/emby.mjs`
  2. `npm.cmd run build`
  3. `cargo check --manifest-path src-tauri/Cargo.toml --all-targets`
  4. `rg -n "[ \t]+$" electron/backend/emby.mjs src-tauri/src/emby/client.rs src-tauri/src/emby/models.rs src/types/models.ts src/views/DetailView.vue src/views/LibraryView.vue docs/CURRENT_STATE.md docs/CHANGE_LOG/2026-05-29-0131-pdp-studios-bitrate-sort.md`
  5. `npm.cmd run electron:build`
- **Result**: passed.
