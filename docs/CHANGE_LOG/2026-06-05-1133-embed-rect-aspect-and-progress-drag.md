# 2026-06-05 11:33 - Embedded player: larger video + draggable progress bar

## Problem (user report)

In embedded native playback the video looked "off-ratio" (small/over-letterboxed) and the progress bar
could not be dragged with the mouse (only keyboard seek worked).

## Root cause

The native mpv child window sits above the opaque WebView, so DOM controls cannot overlay the video. The
code reserves space by shrinking the native window between the top header and the bottom control bar. With a
full-height top header reserved too, the video was squeezed (especially in small windows). The progress bar
(top of the bottom control bar) could be momentarily covered by the native window because the rect re-sync
on control show was deferred (timer + 2x rAF), leaving a race where a quick drag landed on the native
window instead of the slider.

## Changed (`src/views/PlayerView.vue`) — chosen approach: reserve bottom fully, narrow top strip

- `currentEmbedRect()`: the bottom reservation now keeps a 6px margin above the control bar so the native
  window never overlaps the draggable progress bar.
- `watch(showControls)`: now resizes the native window PROMPTLY (`nextTick` + immediate `syncEmbedRect`)
  when controls appear/disappear, instead of the deferred layout-sync timer. This removes the drag race
  (the control bar is clear of the native window as soon as it shows) and lets the video fill the stage as
  soon as controls hide.
- CSS: `.player--embedded .player__top` is slimmed to a narrow 40px strip (smaller title) so the reserved
  dead area above the video is minimal and the video is larger. The bottom control bar (with the progress
  bar) is still fully reserved so it stays visible and interactive.

## Verification

- `npm run tauri:build` passed (vue-tsc type-check + package integrity ok). New exe:
  `src-tauri/target/release/emby-player.exe`, last write `2026-06-05 11:25:59`.
- Interactive behavior (video fills more; progress bar draggable with the mouse) should be confirmed by
  running the new exe.

## Notes / still open

- Default picture mode is `fit` (keepaspect), so the video is never distorted — it letterboxes; this change
  reduces the reserved area so the letterboxed video is larger.
- The fundamental constraint remains (native window over opaque WebView ⇒ controls reserve space rather than
  overlay). Truly overlaying controls would require rendering video inside the WebView or a transparent
  WebView. Remaining larger items: normal window min/max/restore controls, and the white-theme / hero /
  detail-page visual redesign.

## Next

- Commit/push; continue with window controls or the theme/UI redesign per priority.
