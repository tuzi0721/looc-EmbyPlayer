# 2026-06-02 10:32 mpv background color reject

## Scope
- Investigated why the previous Electron native-mpv `wid` screenshots appeared to capture desktop or other-window content.
- Tried a narrow mpv embedded-path change from the default 8-digit background color to plain black RGB, then reran the local embedded playback smoke with retained screenshots.
- No credentials, tokens, full server URLs, playback URLs, or local artifact paths are recorded here.

## Result
- Adding `--alpha=no` caused mpv to exit before IPC became ready, so that variant was rejected.
- Keeping only `--background-color=#000000` allowed mpv to start, but `vo/direct3d` failed to initialize video output and all retained visible screenshots were black.
- The change was reverted to `--background-color=#FF000000`; Electron native mpv `wid` is still not accepted as fixed.

## Validation
- `node --check electron\backend\mpv.mjs` passed.
- `node --check scripts\smoke-electron-embedded-local.mjs` passed.
- Local embedded playback smoke was rerun twice; both runs failed and were manually rejected from retained screenshots.

## Next
- Continue with a different Electron visible playback strategy instead of treating color-only mpv flags as a fix.
- Passing criteria remain: real user-visible video, no desktop/other-window leak, working seek/controls/resize/fullscreen, local decode contract, cleanup, and later real-server multi-size visual inspection.
