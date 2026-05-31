# Electron mpv start guard

- **Time**: 2026-05-29 00:27 (UTC+8)
- **Motivation**: fix a severe playback bug where repeated or concurrent player state calls could spawn many mpv windows, and document the mpv-first route after the Electron migration pivot.
- **Changed files**:
  - `electron/backend/mpv.mjs` - serialize mpv startup with a single-flight guard, add an idle default snapshot, allow IPC property reads without auto-starting mpv, and write mpv logs to Electron user data.
  - `electron/main.mjs` - return the idle snapshot for `get_state` when mpv is not running, make non-playback controls no-op while mpv is idle, and pass the Electron user data dir to mpv logging.
  - `docs/ROADMAP/electron-migration.md` - correct the migration decision to mpv-first instead of HLS-first.
  - `docs/ROADMAP/product-roadmap-v2.md` - add the product/architecture roadmap for connectors, PDP, mpv/libmpv, danmaku, subtitles, enhancement, and desktop integration.
  - `docs/CURRENT_STATE.md` - record the mpv start guard and roadmap update as the latest project state.
- **Risk**: low. Playback startup remains lazy and still starts mpv on `play`, while idle state polling no longer opens a player window. The main behavior change is that control commands must be issued after playback has started.
- **Rollback**: revert this changelog, the two Electron files, the roadmap edits, and the `CURRENT_STATE.md` update.
- **Verification**:
  1. `node --check electron/backend/mpv.mjs`
  2. `node --check electron/main.mjs`
  3. `npm.cmd run build`
  4. `npm.cmd run electron:build`
  5. `20` concurrent idle `MpvController.snapshot()` calls, with `mpv` process count unchanged before/after.
- **Result**: passed.
