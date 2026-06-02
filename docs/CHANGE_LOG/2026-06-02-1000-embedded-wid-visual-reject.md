# 2026-06-02 10:00 Embedded wid visual reject

## Scope
- Reviewed the latest local Electron embedded-player artifacts after the `wid` helper changes.
- The review was manual and visual, not just the script JSON result.
- No real server credentials, tokens, full line URLs, playback URLs, or local screenshot artifact paths are recorded here.

## Result
- The functional chain improved: the local smoke can drive playback state, controls, seek-back, fullscreen, resize, local-decode assertions, and runtime cleanup.
- The visual result is still rejected.
- Windowed screenshots still show desktop or other-window content leaking through the player/window area, so this cannot be accepted as an embedded in-app player fix.
- The full-screen screenshot is cleaner, but one clean size does not override the windowed leakage failure.

## Process correction
- Future visual evidence must be tied to the launched Electron process tree and the exact top-level window handle returned by the backend.
- Captures that fall back to title-only windows, another existing app instance, or unrelated desktop content are not acceptable evidence.
- Passing conclusions must include manual visual inspection across multiple window sizes, then real-account real-server playback checks.

## Next
- Continue tightening Electron native embedding so the video surface is app-contained and opaque in normal windowed mode.
- Re-run local multi-size embedded playback after the fix.
- Only then resume the real-server visual smoke with the test account and multiple window sizes.
