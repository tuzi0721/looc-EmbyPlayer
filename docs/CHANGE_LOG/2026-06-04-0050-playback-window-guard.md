# 2026-06-04 00:50 - Playback Window Guard

## Summary
- Added a command-only real smoke guard for the user-visible "mpv opened as a separate window" failure.
- During playback, the script now enumerates top-level windows in the launched app process tree.
- The guard fails if `mpv.exe` owns a visible top-level window or if more than one `Hills Lite` top-level window is visible.

## Verification
- `node --check scripts\real-server-visual-smoke.mjs`
- `git diff --check`

## Next
- Rerun the real-account command-only playback guard against the current release exe and check whether playback stays embedded at the native-window level.
