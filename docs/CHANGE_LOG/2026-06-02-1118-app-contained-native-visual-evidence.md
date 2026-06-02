# 2026-06-02 11:18 App-contained native visual evidence

## Scope
- Rejected the previous desktop-level screenshot evidence as invalid for playback sign-off.
- Added app-contained native visual capture to the Electron embedded local smoke:
  - CDP page screenshots are kept for the Vue controls layer.
  - Native screenshots target the mpv host window handle only.
  - The smoke now records host window bounds from `get_embed_state` and checks the captured handle against the expected player rectangle.

## Validation
- `node --check scripts\smoke-electron-embedded-local.mjs` passed.
- `node --check electron\main.mjs` passed.
- BrowserWindow-host native mpv smoke did not pass: functional checks, local-decode contract, embed rects, and runtime cleanup passed, but every mpv host screenshot was black while mpv internal screenshot had valid video frames.
- Native-child-host smoke improved but did not pass: initial 1280x800 and fullscreen host screenshots had valid video pixels, but post-fullscreen resize and compact screenshots went black.

## Result
- This is not a playback pass.
- The evidence path is now process-scoped and app-contained, so future visual claims must use these targeted screenshots instead of desktop screenshots that may include unrelated windows.
- Current failure is narrowed to native mpv host visibility/repaint after resize, not to server transcoding or mpv decode.

## Next
- Stop the native child helper from repainting the mpv host window black during rect updates.
- Rebuild `electron_mpv_host.exe`, rerun native-child smoke, and only then continue toward automatic Electron mpv selection for real MKV sources.
