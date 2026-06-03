# 2026-06-03 14:46 Tauri release blank packaging audit

## What changed

- Audited the current Tauri release artifacts after the real command-only smoke reported `hasBridge:false`, `hasRouter:false`, and `route:"blank"`.
- Confirmed `src-tauri\target\release\bundle` is currently empty, so the previously reported `src-tauri\target\release\emby-player.exe` is a bare release executable, not a produced Tauri bundle artifact.
- Confirmed `dist\index.html` and hashed frontend assets exist, but the current package integrity check only verifies the release exe and bundled mpv runtime. It does not prove that the release WebView loaded the Vue app or Tauri invoke bridge.
- Confirmed `tauri.conf.json` has `bundle.active:false`, so `npm.cmd run tauri:build` is not expected to leave a bundled installer/portable directory under `target\release\bundle`.

## Evidence

- `src-tauri\target\release\bundle` listing returned empty.
- `dist\index.html` exists and references local hashed assets.
- `scripts\check-tauri-package.mjs` only checks `emby-player.exe` plus `resources\mpv`; it has no frontend-loadability gate.

## Next

- Strengthen the Tauri package/release verification so a release cannot be treated as valid unless frontend resources are present and the startup bridge can be reached.
- Rebuild with the corrected release path, then rerun command-only real-server validation without screenshots.
