# 2026-06-03 15:30 Tauri compat bridge

## What changed

- Added `installTauriCompatBridge()` in `src\platform\index.ts`.
- `src\main.ts` installs the bridge before mounting the Vue app.
- Tauri now exposes a `window.hillsLite` compatibility bridge with:
  - `invoke`
  - `listen`
  - `openFileDialog`
  - `platformType`

## Why

- The rebuilt release now loads the frontend and Vue router, but command-only validation showed `window.hillsLite.invoke missing`.
- Electron already exposes `window.hillsLite` through preload. Tauri used `@tauri-apps/api` directly, which made verifier and some runtime checks treat Tauri as missing the desktop bridge.

## Verification

- `npm.cmd run build`
- `node --check scripts\real-server-visual-smoke.mjs`

## Next

- Rebuild the Tauri release so the compatibility bridge is embedded.
- Rerun real-account command-only validation without screenshots.
