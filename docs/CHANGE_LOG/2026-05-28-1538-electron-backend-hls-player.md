# Electron backend and HLS player

- **Time**: 2026-05-28 15:38 (UTC+8)
- **Motivation**: make the Electron route usable for real Emby/Jellyfin browsing and single-window playback instead of stopping at an empty shell or continuing to depend on the external mpv window path.
- **Changed files**:
  - `electron/backend/store.mjs` - add a JSON-backed Electron state store for settings, servers, accounts, active account selection, notifications, and downloads, with first-run import from the old Tauri `app.embyplayer/config.json` store when Electron state is empty.
  - `electron/backend/emby.mjs` - add a tolerant Electron-side Emby/Jellyfin client for login, views, item lists, details, search, seasons, episodes, user data actions, line tests, and HLS playback source creation.
  - `electron/backend/emby.mjs` - add Electron playback progress/stopped reporting so HTML5 playback updates Emby/Jellyfin resume state.
  - `electron/main.mjs` - route renderer IPC commands to the new Electron store/client services, disable web security for desktop media playback requests that need tokenized cross-origin HLS segments, keep Electron user data in a writable `.electron-user-data` directory beside the exe when packaged, and warm-load the store at startup.
  - `src/api/index.ts` - add `getPlaybackSource` for the HLS-first player path.
  - `src/stores/auth.ts` - restore the active account from backend account ordering after refresh.
  - `src/views/PlayerView.vue` - add Electron-only inline HTML5/HLS playback with `hls.js`, responsive video sizing, poster/backdrop loading state, local controls for play, seek, volume, mute, and speed, plus progress reporting, queue previous/next handling, ended auto-advance, HLS fatal error display, and HLS network-speed sampling.
  - `docs/CURRENT_STATE.md` / `docs/ROADMAP/electron-migration.md` - record the Electron backend and HLS player slice.
- **Risk**: medium. The Electron backend is now functional for core browsing and playback, but downloads, remote control, subtitles, and global shortcuts remain placeholder/no-op or explicit unavailable responses until their services are migrated. `webSecurity: false` is a desktop-app tradeoff to allow tokenized Emby/Jellyfin media URLs and HLS segment loading from user-configured servers.
- **Rollback**: revert this changelog, the Electron backend modules and IPC routing, the playback source API, the auth refresh adjustment, and the Electron playback changes in `PlayerView.vue`.
- **Verification**:
  1. `node --check electron/main.mjs`
  2. `node --check electron/backend/store.mjs`
  3. `node --check electron/backend/emby.mjs`
  4. `git diff --check -- electron src/api/index.ts src/stores/auth.ts src/views/PlayerView.vue`
  5. `npm.cmd run build`
  6. `npm.cmd run electron:build`
  7. Start `release-electron/win-unpacked/Hills Lite.exe` for 10s and stop it after confirming it remains alive.
  8. Load the Electron store once and confirm the legacy Tauri config imports without printing account tokens.
  9. Start the packaged exe and confirm `release-electron/win-unpacked/.electron-user-data/state.json` is created beside the exe.
- **Result**: passed.
