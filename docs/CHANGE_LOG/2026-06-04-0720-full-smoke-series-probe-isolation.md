# 2026-06-04 07:20 - Full smoke series probe isolation

## What changed

- Changed the full real-server smoke series-detail probe so it inspects the real play button and hit target without opening a second playback session by default.
- Kept the real series playback probe available behind `HILLS_REAL_SERIES_PLAY_PROBE=1` for focused debugging, instead of letting the default full smoke pollute the later main playback check.
- Added `hitTag`, `hitClass`, and `clickSkipped` evidence to the series detail play stage.
- Tightened `DetailView` hero pointer behavior so the visual hero layer no longer disables play/favorite action hit testing; background and shade layers remain non-interactive while the buttons stay clickable.

## Verification

- `node --check scripts\real-server-visual-smoke.mjs`
- `npm.cmd run build`
- `git diff --check`

## Next

- Commit and push this phase.
- Rebuild the Tauri release and rerun full real-account smoke from a clean process.
- If playback still stays black or an extra top-level mpv window appears, retain artifacts for one diagnostic run, inspect the log, delete the temp artifact directory, and continue from the real failure.
