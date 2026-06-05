# 2026-06-05 19:30 - Embedded video fills the stage via windowed auto-hide

## Diagnosis (#6 "video only fills a small area")

Added temporary logging of the embed rect sent to the native window and ran a real full smoke. The native
window TRACKS the stage correctly (e.g. `w=2560 h=1260` maximized, `w=744 h=243` at a ~760px window) — so
it is not a DPI/scale bug. The problem: at non-maximized sizes the reserved control bars (slim top + the
tall bottom control bar) leave a short, wide region, so the 16:9 video letterboxes into a small area. And in
WINDOWED embedded mode the controls never auto-hid (auto-hide had been gated to fullscreen only), so the
video stayed squeezed.

## Changed (`src/views/PlayerView.vue`)

- `bumpControls()` now arms the controls auto-hide timer for embedded video in BOTH windowed and fullscreen
  (previously windowed embedded returned early). Controls are kept while paused or a player panel is open.
  When controls hide, the `showControls` watcher re-syncs the embed rect to the full stage, so the native
  video grows to fill the area; moving the mouse brings the controls back (and shrinks the video to leave
  the bar clear). This also makes fullscreen controls reliably reappear on mouse move (#1 improvement).
- Removed the temporary `embed_set_rect` logging in `commands/player.rs`.

## Verification

- `npm run tauri:build` passed (vue-tsc + vite + cargo + package integrity ok). exe rebuilt.
- Behavior (video fills when idle / controls return on mouse move) to be confirmed by running.

## Still open (user-reported)

- #1 fullscreen controls operability — should be improved by auto-hide; confirm by running.
- #2 buffering indicator, #3 slow posters, #4 cannot delete saved server (backend `remove_server` looks
  correct; needs UI-source/reproduction details).

## Next

- Get user confirmation on #6/#1; investigate #4 (what happens on delete), #2, #3.
