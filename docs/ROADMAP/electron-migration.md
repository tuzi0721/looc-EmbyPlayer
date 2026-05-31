# Electron migration roadmap

## Decision

Hills Lite will move toward an Electron + Vue 3 + TypeScript architecture with an mpv-first playback core. HLS/browser playback is only a fallback path for limited environments; the product direction must preserve MKV, ASS subtitles, multi-audio, chapters, advanced cache behavior, and future libmpv/D3D11 composition support.

## Why

- Tauri WebView2 cannot reliably compose a native external mpv window with web-rendered controls, posters, overlays, and fullscreen behavior.
- The current Rust command model makes non-standard Emby/Jellyfin JSON responses fail hard at deserialization boundaries.
- TypeScript is a better fit for fast UI iteration, tolerant response normalization, and a single rendering surface.
- mpv/libmpv is still the correct media engine for the target product because browser playback is not reliable enough for MKV, ASS subtitles, complex audio/subtitle tracks, and advanced video processing.

## Target Stack

- Electron main process for desktop shell, filesystem, dialogs, shortcuts, notifications, and optional native helpers.
- Vue 3 + TypeScript + Pinia for UI and state.
- mpv-first playback for MKV, ASS subtitles, multi-audio, and advanced container support.
- HTML5/HLS playback remains a fallback for environments where mpv is unavailable.

## Migration Phases

1. **Platform bridge**
   - Route all renderer `invoke`, event listening, platform detection, and file dialog calls through `src/platform`.
   - Keep Tauri working while adding Electron preload/main bridge.

2. **Electron backend**
   - Port settings, accounts, servers, and notifications to Electron main process services.
   - Store data in app data JSON/SQLite with typed migration boundaries.

3. **TypeScript Emby/Jellyfin client**
   - Move Emby/Jellyfin HTTP client and tolerant response normalization to TypeScript.
   - Keep response parsing permissive at boundaries and strict inside the UI state model.

4. **mpv-first player**
   - Use mpv IPC as the default Electron playback core.
   - Keep the existing Hills Lite player UI and command model; later evaluate native-window/libmpv embedding for true single-window composition.
   - Keep `<video>`/HLS as a fallback path only.

5. **Retire Tauri**
   - Once Electron services cover login, library browsing, settings, playback, downloads, notifications, shortcuts, and release packaging, remove Tauri/Rust runtime from the default product.

## Current Slice

- `src/platform` now abstracts renderer calls away from direct `@tauri-apps/*` imports.
- `electron/main.mjs` and `electron/preload.mjs` provide the Electron bridge entry point.
- `electron/backend/store.mjs` stores Electron settings, servers, accounts, notifications, and downloads in project-local JSON state, and imports the old Tauri app config on first run when Electron state is empty.
- `electron/backend/emby.mjs` provides the Electron Emby/Jellyfin client for login, library browsing, detail loading, search, seasons/episodes, user data actions, line tests, and HLS playback source creation.
- `electron/backend/mpv.mjs` uses mpv IPC as the default Electron playback core, while `src/views/PlayerView.vue` keeps the existing player store/mpv command route.
- `src/views/PlayerView.vue` still contains the HTML5/HLS path as fallback code, but it is no longer the default because mpv is required for MKV and advanced subtitle/container support.
- `package.json` declares Electron scripts and target packaging metadata.
- `package-lock.json` is updated after installing Electron, hls.js, and electron-builder.
- `npm.cmd run electron:build` produces the unpacked Electron app at `release-electron/win-unpacked/Hills Lite.exe`.
