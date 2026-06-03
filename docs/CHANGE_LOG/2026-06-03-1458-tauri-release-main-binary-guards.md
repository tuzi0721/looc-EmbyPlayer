# 2026-06-03 14:58 Tauri release main binary guards

## What changed

- Set `mainBinaryName` to `emby-player` in `src-tauri\tauri.conf.json` so Tauri build targets the app binary explicitly when the helper binary also exists.
- Changed `npm.cmd run tauri:build` to pass `--features mpv-embedded`, keeping release builds aligned with the native embedded player path under investigation.
- Updated `scripts\run-release.ps1` so an existing Tauri exe is rebuilt when relevant release inputs are newer instead of blindly launching a stale executable.
- Strengthened `scripts\check-tauri-package.mjs` so it rejects a stale release exe when `tauri.conf.json`, `package.json`, or `dist\index.html` is newer.
- Updated the real-server command verifier to wait for and log the selected CDP page URL, avoiding silent selection of an `about:blank` target.

## Verification

- `node --check scripts\check-tauri-package.mjs`
- `node --check scripts\real-server-visual-smoke.mjs`
- `npm.cmd run check:tauri-package` now correctly fails until the release exe is rebuilt after the Tauri config/package changes.

## Next

- Rebuild with `npm.cmd run tauri:build`.
- Rerun command-only real-server validation without screenshots against the rebuilt `emby-player.exe`.
