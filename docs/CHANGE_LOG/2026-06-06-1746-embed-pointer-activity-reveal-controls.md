# 2026-06-06 17:46 - Reveal player controls on mouse move over the native video (#1)

## Problem

With the embedded native mpv window covering the stage (especially after controls auto-hide so the video
fills), moving the mouse over the video did not reveal the controls — the native child window swallows mouse
events and WebView2 does not reliably receive them through `HTTRANSPARENT`. Result: controls could only be
summoned at the window edges ("仅有概率能操作"), and the progress bar was effectively unreachable in
fullscreen.

## Changed

- `src-tauri/src/commands/player.rs`: new `embed_pointer_moved(window)` command (Windows) that reads the OS
  cursor via `GetCursorPos`, returns `true` when the cursor moved since the last poll AND is inside the
  window's outer bounds. Non-Windows stub returns `false`.
- `src-tauri/src/lib.rs`: registered the command.
- `src/api/index.ts`: `embedPointerMoved()` wrapper.
- `src/views/PlayerView.vue`: while the embedded host is active, poll `embedPointerMoved()` every 250ms;
  when it reports movement, call `bumpControls()` to reveal the controls and restart the auto-hide timer.
  Polling starts in `setupEmbeddedVideoHost` and stops in `resetEmbeddedVideoHostLayoutState`/teardown.

## Effect

- Moving the mouse anywhere over the player (including the video region covered by the native window) now
  reveals the controls; once shown, the native window shrinks to leave the control bar clear so the progress
  bar and buttons are directly clickable/draggable (windowed and fullscreen).

## Verification

- `npm run tauri:build` passed (vue-tsc + vite + cargo + package integrity ok). exe rebuilt.
- Interactive (mouse-over-video reveals controls; progress bar draggable in fullscreen) to be confirmed by
  running.

## Next

- Confirm #1 by running; then #3 poster loading speed.
