# 2026-06-02 10:17 Electron mpv embed failure matrix

## Scope
- Continued the Electron native-mpv playback investigation after the previous visual reject.
- Tested the local embedded playback smoke with multiple rendering/composition variants and manually inspected the retained screenshots.
- No credentials, tokens, full server URLs, playback URLs, or local artifact paths are recorded here.

## Code changes kept for the next experiment
- mpv now starts with `--no-config` so machine-local mpv config cannot affect app playback.
- The embedded mpv path pins a Windows video output attempt and an opaque black background.
- The old Electron GPU-disable startup switches are now controlled by `HILLS_ELECTRON_DISABLE_GPU=1` instead of being unconditional, so both composition modes can be tested explicitly.
- The helper keeps hit-test transparency; removing it did not improve visual output and would risk real mouse input over the video surface.

## Results
- `wid` with the old forced GPU-disable path: functional checks can pass, but windowed screenshots still show desktop/other-window content leaking through the player. Rejected.
- `wid` with default Electron GPU composition: the leak changes into a mostly black/blank visible video surface. Rejected.
- Removing helper hit-test transparency did not fix the leak. Rejected and reverted.
- Overlay fallback did not provide a stable app-contained result; placement/layering was not reliable enough for the Electron player. Rejected.
- In all failed variants, the local-decode contract still passed and runtime cleanup left no tracked child process behind, so the remaining blocker is the user-visible rendering path.

## Next
- Do not claim Electron native mpv embedding is fixed.
- Continue with an alternative visible playback path for Electron that keeps decoding on the client and avoids server transcoding.
- Re-run local and then real-server visual smoke only after the user-visible window is clean in multiple sizes.
