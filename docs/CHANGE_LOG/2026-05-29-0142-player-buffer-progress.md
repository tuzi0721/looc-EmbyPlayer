# Player buffer progress

- **Time**: 2026-05-29 01:42 (UTC+8)
- **Motivation**: continue the player roadmap by making the mini progress bar show cached/buffered progress and a clear buffering state.
- **Changed files**:
  - `electron/backend/mpv.mjs` - read `demuxer-cache-duration`, `paused-for-cache`, and `cache-buffering-state` from mpv snapshots.
  - `electron/main.mjs` - include the new buffer fields in the idle/default snapshot.
  - `src/types/models.ts` - add optional buffered and buffering fields to `MpvSnapshot`.
  - `src/views/PlayerView.vue` - render a buffered track under playback progress and show a compact buffering badge; HTML video fallback also maps native buffered ranges.
  - `docs/CURRENT_STATE.md` - record the player buffered progress increment.
- **Risk**: medium. The mpv properties are read opportunistically with fallbacks; UI remains usable if a property is unavailable.
- **Rollback**: revert this changelog, the mpv snapshot additions, the player progress-bar UI changes, and the `CURRENT_STATE.md` update.
- **Verification**:
  1. `node --check electron/backend/mpv.mjs`
  2. `node --check electron/main.mjs`
  3. `npm.cmd run build`
  4. `rg -n "[ \t]+$" electron/backend/mpv.mjs electron/main.mjs src/types/models.ts src/views/PlayerView.vue docs/CURRENT_STATE.md docs/CHANGE_LOG/2026-05-29-0142-player-buffer-progress.md`
  5. `npm.cmd run electron:build`
- **Result**: passed.
