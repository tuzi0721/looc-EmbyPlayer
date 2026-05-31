# Queue title year format

- **Time**: 2026-05-29 01:44 (UTC+8)
- **Motivation**: improve playlist readability by putting years directly in queue titles and replacing the older `Sx:Ex - title` format with a clearer episode separator.
- **Changed files**:
  - `src/views/PlayerView.vue` - format episode queue titles as `S01E02 · Title (Year)` and non-episode titles as `Title (Year)`, while keeping the series name in the subtitle line.
  - `docs/CURRENT_STATE.md` - record the queue-title formatting increment.
- **Risk**: low. This only changes displayed queue labels; playback queue IDs and navigation are unchanged.
- **Rollback**: revert this changelog, the queue title/subtitle formatting changes, and the `CURRENT_STATE.md` update.
- **Verification**:
  1. `npm.cmd run build`
  2. `rg -n "[ \t]+$" src/views/PlayerView.vue docs/CURRENT_STATE.md docs/CHANGE_LOG/2026-05-29-0144-queue-title-year-format.md`
  3. `npm.cmd run electron:build`
- **Result**: passed.
