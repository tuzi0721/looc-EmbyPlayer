# 2026-06-02 10:51 Electron unpacked refresh

## Scope
- Refreshed the Electron unpacked build after restoring Electron's default visible HTML playback path.
- Confirmed the old portable single-file executable is still absent.
- No credentials, tokens, full server URLs, playback URLs, or local screenshot artifact paths are recorded here.

## Validation
- `npm.cmd run electron:build` passed.
- The command included Electron command coverage, production build, release helper build, `electron-builder --win dir`, and package integrity check.
- Package integrity confirmed bundled mpv resources, the Electron mpv host helper, and `app.asar`.

## Output
- Current unpacked executable: `release-electron\win-unpacked\Hills Lite.exe`
- The unpacked executable timestamp is 2026-06-02 10:51:19.
- The helper timestamp is 2026-06-02 10:51:16.
- The old portable `release-electron\Hills Lite 0.1.0.exe` is not present.

## Next
- Use the refreshed executable for real-account, real-server visual testing across multiple window sizes.
- Keep rejecting any visual evidence that captures desktop or other-window content.
