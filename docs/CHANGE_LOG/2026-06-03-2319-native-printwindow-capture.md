# 2026-06-03 23:19 - Native PrintWindow Capture

## Summary
- Updated the real playback verifier's native capture helper.
- When a specific native hwnd is available, the verifier now captures with `PrintWindow(PW_RENDERFULLCONTENT)` instead of `Graphics.CopyFromScreen`.
- Broad/window-enumeration capture still uses screen copy, but Tauri/Electron embedded playback should now use the app-owned hwnd path.

## Verification
- `node --check scripts\real-server-visual-smoke.mjs`
- `git diff --check`

## Next
- Rerun the real-account command-only playback guard against the already rebuilt release executable.
