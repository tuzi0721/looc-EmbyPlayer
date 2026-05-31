# Roadmap v2 and play serialization

- **Time**: 2026-05-29 00:53 (UTC+8)
- **Motivation**: turn the expanded product feature list into an executable roadmap and start the first reliability task by preventing overlapping Electron play requests from racing through mpv.
- **Changed files**:
  - `electron/main.mjs` - add a serialized play queue and merge duplicate in-flight play requests for the same item/start/direct-play tuple.
  - `src/views/DetailView.vue` - guard the hero play button and episode cards against repeated navigation while a player route transition is already in progress.
  - `docs/ROADMAP/product-roadmap-v2.md` - expand the roadmap into ordered gates and feature lanes for online media, file services, PDP, player, danmaku, subtitles/AI, HDR/enhancement, and desktop ecosystem work.
  - `docs/CURRENT_STATE.md` - record the roadmap expansion and play serialization as the latest project state.
- **Risk**: low to medium. Play requests now execute in order, so rapid different-item clicks intentionally resolve sequentially with the latest request winning visually after it reaches mpv. Detail page play controls are temporarily disabled during route navigation. This avoids concurrent load races while preserving the existing UI and mpv-first path.
- **Rollback**: revert this changelog, the play queue additions in `electron/main.mjs`, the roadmap expansion, and the `CURRENT_STATE.md` update.
- **Verification**:
  1. `node --check electron/main.mjs`
  2. `npm.cmd run build`
  3. `npm.cmd run electron:build`
- **Result**: passed.
