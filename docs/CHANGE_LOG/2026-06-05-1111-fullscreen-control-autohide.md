# 2026-06-05 11:11 - Fullscreen control auto-hide + cursor hide (embedded player)

## Problem (user report from running the release)

Embedded playback felt like "fake fullscreen": entering fullscreen kept the player controls permanently
visible (so it looked like a maximized window), and the mouse cursor stayed on screen.

## Root cause

`bumpControls()` did `if (embedVideo) return;` BEFORE arming the auto-hide timer, so in embedded native
playback the controls never auto-hid. (The early return existed because hiding controls resizes the
reserved native-video rect; that trade-off is acceptable in fullscreen but not in a normal window.)

## Changed

- `src/views/PlayerView.vue`
  - `bumpControls()` now arms the auto-hide timer for embedded video WHEN in fullscreen (native or
    document fullscreen). In a normal window, embedded controls stay (avoids resizing the reserved video
    area on idle); HTML video keeps its normal always-auto-hide behavior. Controls still never hide while a
    player panel is open.
  - `toggleFullscreen()` calls `bumpControls()` after entering fullscreen so the auto-hide countdown starts.
  - Added `player--hide-cursor` class (bound to `!showControls`) with `cursor: none` so the mouse cursor
    hides together with the controls during fullscreen playback. Moving the mouse fires `@mousemove ->
    bumpControls` (the native child window is `HTTRANSPARENT`, so moves pass through to the WebView),
    re-showing controls + cursor and restarting the countdown.
  - Top/bottom controls are `v-if="showControls"`, so when they hide the embed rect recomputes to the full
    stage (video fills the screen in fullscreen); on reveal it reserves the control area again.

## Verification

- Lints clean; `npm run tauri:build` passed (package integrity ok). New exe:
  `src-tauri/target/release/emby-player.exe`, last write `2026-06-05 11:09:11`.
- The auto-hide / cursor-hide / mouse-reveal behavior is interactive and should be confirmed by running the
  exe in fullscreen.

## Notes / not in this change

- The broader items the user raised remain open and are larger design tasks: video aspect when controls are
  shown (reserve-space squish), mouse-draggable progress bar over the native window, normal window
  min/max/restore controls, and a white-theme/hero/detail-page visual redesign.

## Next

- Commit/push. Then tackle the remaining player-UX / theme items per priority.
