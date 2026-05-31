# Danmaku menu and merge

- **Time**: 2026-05-29 02:11 (UTC+8)
- **Motivation**: make danmaku status easier to inspect from the player controls and reduce screen clutter from near-duplicate comments.
- **Changed files**:
  - `src/types/models.ts` - add optional `count` to `DanmakuComment`.
  - `src/views/PlayerView.vue` - add a danmaku popup menu with status/source/count rows, keep the count as its own third row, fetch danmaku for the current queue item, and merge repeated comments within a short time window.
  - `src/components/player/DanmakuOverlay.vue` - render merged comments with a `×N` suffix.
  - `docs/CURRENT_STATE.md` - record this danmaku increment.
- **Risk**: low to medium. Duplicate detection is intentionally conservative: it merges identical normalized text in the same display mode within 1.2 seconds, preserving the earliest comment's color and time.
- **Rollback**: revert this changelog, the danmaku count/merge changes, the player menu updates, and the `CURRENT_STATE.md` entry.
- **Verification**:
  1. `npm.cmd run build`
  2. `rg -n "[ \t]+$" src/types/models.ts src/views/PlayerView.vue src/components/player/DanmakuOverlay.vue docs/CURRENT_STATE.md docs/CHANGE_LOG/2026-05-29-0211-danmaku-menu-merge.md`
  3. `npm.cmd run electron:build`
- **Result**: passed.
