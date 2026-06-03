# 2026-06-03 19:53 - Compact home hero ratio

## Changed
- Tuned the home cinema hero at very small window heights.
- The `max-height: 480px` breakpoint now uses a fixed `3 / 1` compact cinema ratio instead of letting `max-height` distort the existing `16 / 7` layout.
- Reduced compact hero title/logo spacing slightly so the hero keeps a stable banner shape while exposing more of the continue-watching/media-library rows below it.

## Verification
- `npm.cmd run build`

## Next
- Commit/push this phase, rebuild the packaged release exe, then rerun real native-resize layout metrics against the release.
