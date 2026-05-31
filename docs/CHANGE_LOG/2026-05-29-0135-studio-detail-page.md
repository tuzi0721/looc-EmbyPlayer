# Studio detail page

- **Time**: 2026-05-29 01:35 (UTC+8)
- **Motivation**: extend the PDP studio row into a navigable studio experience so Emby/Jellyfin detail pages can jump from a production company to that studio's related media.
- **Changed files**:
  - `src/views/DetailView.vue` - keep studio IDs with their labels and make visible/overflow studio pills clickable.
  - `src/views/StudioView.vue` - add a studio detail/listing page with paging, sorting, loading/empty/error states, and poster-card navigation.
  - `src/router/index.ts` - add `/studio/:id` as the studio detail route.
  - `docs/CURRENT_STATE.md` - record the studio jump/detail-page increment.
- **Risk**: medium. The page relies on Emby/Jellyfin item filtering by `StudioIds`; a fallback name route uses `Studios` when a studio ID is missing.
- **Rollback**: revert this changelog, the `StudioView.vue` file, the route addition, the clickable studio changes in `DetailView.vue`, and the `CURRENT_STATE.md` update.
- **Verification**:
  1. `npm.cmd run build`
  2. `rg -n "[ \t]+$" src/views/DetailView.vue src/views/StudioView.vue src/router/index.ts docs/CURRENT_STATE.md docs/CHANGE_LOG/2026-05-29-0135-studio-detail-page.md`
  3. `npm.cmd run electron:build`
- **Result**: passed.
