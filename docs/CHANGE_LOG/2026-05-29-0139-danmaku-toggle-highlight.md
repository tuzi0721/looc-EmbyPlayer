# Danmaku toggle highlight

- **Time**: 2026-05-29 01:39 (UTC+8)
- **Motivation**: make the player danmaku state easier to scan by showing explicit button text and applying the existing accent active state when danmaku is enabled.
- **Changed files**:
  - `src/views/PlayerView.vue` - add a compact `弹幕` label to the danmaku control, keep it accent-highlighted through the active class, and collapse back to icon-only on narrow windows.
  - `docs/CURRENT_STATE.md` - record the player danmaku toggle UI increment.
- **Risk**: low. The control still calls the existing `toggleDanmaku` handler; only the visible button shape and responsive styling changed.
- **Rollback**: revert this changelog, the `PlayerView.vue` button/style edits, and the `CURRENT_STATE.md` update.
- **Verification**:
  1. `npm.cmd run build`
  2. `rg -n "[ \t]+$" src/views/PlayerView.vue docs/CURRENT_STATE.md docs/CHANGE_LOG/2026-05-29-0139-danmaku-toggle-highlight.md`
  3. `npm.cmd run electron:build`
- **Result**: passed.
