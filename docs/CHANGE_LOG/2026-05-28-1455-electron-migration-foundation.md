# Electron migration foundation

- **Time**: 2026-05-28 14:55 (UTC+8)
- **Motivation**: stop extending the unstable Tauri/WebView2 + external mpv window path and begin moving Hills Lite toward a more reliable Electron + Vue + TypeScript architecture.
- **Changed files**:
  - `src/platform/index.ts` - add a renderer platform bridge for invoke, event listening, platform detection, and file dialogs.
  - `src/api/index.ts`, `src/App.vue`, `src/stores/downloads.ts`, `src/stores/notifications.ts`, `src/stores/server.ts`, `src/components/player/SubtitlePanel.vue`, `src/components/common/MpvBanner.vue` - replace direct `@tauri-apps/*` usage with the platform bridge.
  - `electron/main.mjs` - add the Electron shell entry point with a secure BrowserWindow, platform/dialog handlers, and a guarded IPC invoke fallback.
  - `electron/preload.mjs` - expose the narrow renderer bridge through `contextBridge`.
  - `package.json` - add Electron scripts, Electron packaging metadata, and the planned Electron/hls.js dependencies.
  - `package-lock.json` - lock Electron, hls.js, and electron-builder after dependency installation.
  - `.gitignore` - ignore Electron local user data, builder cache, and unpacked release output.
  - `docs/ROADMAP/electron-migration.md` - document the migration decision and phases.
  - `docs/CURRENT_STATE.md` - record the Electron migration foundation as the latest project state.
- **Risk**: medium. The renderer now loads Tauri APIs lazily behind an abstraction, and existing Vite/Tauri build remains green. Electron runtime commands beyond `open_external`, `detect_mpv`, dialogs, and platform detection are intentionally not migrated yet and return explicit errors.
- **Note**: Electron uses a project-local user data/cache path and GPU-safe startup switches because this Windows environment crashes Chromium's GPU process without them. `electron:build` currently produces an unpacked `dir` build without requiring NSIS downloads; `electron:dist` remains available for future portable builds once NSIS/electron-builder binaries are cached or mirrored.
- **Rollback**: revert the Electron files, `src/platform`, package metadata changes, and direct import rewrites listed above.
- **Verification**:
  1. `npm.cmd run build`
  2. `git diff --check -- package.json src/platform/index.ts electron/main.mjs electron/preload.mjs src/api/index.ts src/App.vue src/stores/downloads.ts src/stores/notifications.ts src/stores/server.ts src/components/player/SubtitlePanel.vue src/components/common/MpvBanner.vue`
  3. `node --check electron/main.mjs`
  4. `node --check electron/preload.mjs`
  5. `npm.cmd ls electron hls.js electron-builder --depth=0`
  6. `.\node_modules\.bin\electron.cmd --disable-gpu --disable-gpu-compositing --disable-software-rasterizer --in-process-gpu electron/main.mjs` with a 15s timeout to confirm the Electron shell no longer exits immediately.
  7. `npm.cmd run electron:build`
  8. Start `release-electron/win-unpacked/Hills Lite.exe` for 10s and stop it after confirming it remains alive.
- **Result**: passed. Unpacked Electron executable generated at `release-electron/win-unpacked/Hills Lite.exe`.
