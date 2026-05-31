# Electron mpv playback core

- **Time**: 2026-05-29 00:01 (UTC+8)
- **Motivation**: keep mpv as the default playback core after the Electron migration because browser video playback is not reliable enough for MKV, ASS subtitles, multi-audio, and advanced container support.
- **Changed files**:
  - `electron/backend/mpv.mjs` - add an Electron-side mpv IPC controller that detects bundled/configured mpv, starts mpv with a named pipe, sends JSON IPC commands, and reads playback snapshots.
  - `electron/main.mjs` - wire `detect_mpv`, `play`, `pause`, `resume`, `stop`, `seek`, speed, volume, mute, audio track, subtitle track, subtitle delay/scale, and subtitle add/remove/cycle commands to the Electron mpv controller.
  - `electron/backend/emby.mjs` - add an mpv-oriented playback source builder that prefers Emby/Jellyfin direct stream URLs signed with the active account token.
  - `package.json` - package `src-tauri/resources/mpv` into Electron `extraResources` so unpacked Electron builds include `resources/mpv/mpv.exe`.
  - `src/App.vue` - show the existing mpv detection banner again when mpv is missing.
  - `src/views/PlayerView.vue` - restore the default playback route to the existing player store/mpv command path; the HTML5/HLS player remains as fallback code but is not the default.
  - `docs/CURRENT_STATE.md` / `docs/ROADMAP/electron-migration.md` - record that Electron keeps mpv as the default playback kernel.
- **Risk**: medium. The first Electron mpv path uses an external mpv window controlled over IPC, matching the existing reliable backend behavior. True in-window mpv composition still needs a later native-window/libmpv integration pass if the UI must overlay directly on top of video.
- **Rollback**: remove the Electron mpv controller and command wiring, remove Electron `extraResources`, and switch `PlayerView.vue` back to the HLS default.
- **Verification**:
  1. `node --check electron/main.mjs`
  2. `node --check electron/backend/mpv.mjs`
  3. `node --check electron/backend/emby.mjs`
  4. `git diff --check -- electron package.json src/App.vue src/views/PlayerView.vue docs/CURRENT_STATE.md docs/ROADMAP/electron-migration.md`
  5. `npm.cmd run build`
  6. `npm.cmd run electron:build`
  7. Start packaged `release-electron/win-unpacked/Hills Lite.exe` with remote debugging and confirm `detect_mpv` returns the bundled `resources/mpv/mpv.exe`.
  8. Invoke `get_state` from the packaged renderer and confirm mpv IPC returns a snapshot.
- **Result**: passed.
