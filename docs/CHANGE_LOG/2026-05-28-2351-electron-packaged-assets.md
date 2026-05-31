# Electron packaged asset loading

- **Time**: 2026-05-28 23:51 (UTC+8)
- **Motivation**: packaged Electron opened to a black window because the built `index.html` referenced `/assets/...`; under `file://` this resolved to `file:///A:/assets/...`, so the renderer JavaScript and CSS were not loaded.
- **Changed files**:
  - `vite.config.ts` - set `base: "./"` so built assets are relative to `dist/index.html` in both unpacked Electron and Tauri builds.
  - `src/App.vue` - keep the existing Hills Lite shell/UI, but hide the mpv install banner in Electron because the default Electron route uses the HLS player rather than mpv.
  - `docs/CURRENT_STATE.md` - record the packaged Electron black-screen fix as the latest project state.
- **UI note**: this does not redesign the renderer. The intent is to preserve the existing Hills Lite Vue UI and swap only the desktop shell/backend/player plumbing underneath it.
- **Risk**: low. Relative Vite assets are the expected shape for `file://` desktop shells. Tauri also loads the bundled frontend from local files, so this is compatible with the existing desktop target.
- **Rollback**: remove `base: "./"` from `vite.config.ts` and rebuild, though packaged Electron will return to the black-screen asset path failure.
- **Verification**:
  1. `npm.cmd run build`
  2. Confirm `dist/index.html` references `./assets/...`.
  3. `npm.cmd run electron:build`
  4. Start packaged `release-electron/win-unpacked/Hills Lite.exe` with remote debugging and confirm the renderer has non-empty `#app` HTML and no `file:///A:/assets/...` load failures.
- **Result**: passed.
