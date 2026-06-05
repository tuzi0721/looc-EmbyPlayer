# 2026-06-05 17:10 - UI redesign Phase 4: custom window title bar

## Changed

- `src-tauri/tauri.conf.json`
  - Window `decorations` set to `false` (undecorated; the app draws its own title bar).
- `src/components/common/WindowTitleBar.vue` (NEW)
  - Dark themed title bar: a `data-tauri-drag-region` drag area with the app name on the left, and
    minimize / maximize-restore / close buttons on the right (red close hover). Uses
    `@tauri-apps/api/window` `getCurrentWindow()` (`minimize` / `toggleMaximize` / `close` / `isMaximized`,
    `onResized` to keep the max/restore icon in sync). No-ops gracefully outside the Tauri runtime.
  - Re-adds resize affordances lost with `decorations:false`: 8 fixed edge/corner grips that call
    `startResizeDragging(<direction>)` on pointer-down, with the matching resize cursors.
- `src/App.vue`
  - Shell is now a column: `WindowTitleBar` on top (only when `hasNativeRuntime()` and NOT on the
    fullscreen/player route) above a new `.app-body` row that wraps the sidebar + content. So the title bar
    is hidden on the immersive player route ("全屏隐藏") and present elsewhere.

## Verification

- `npm run tauri:build` passed (vue-tsc + vite + cargo + package integrity ok). New exe:
  `src-tauri/target/release/emby-player.exe`, last write `2026-06-05 17:10:02`.
- Interactive behavior to confirm by running: window dragging via the bar, minimize/maximize/restore/close,
  resizing from edges/corners, and the bar being hidden during playback.

## Notes

- With `decorations:false` the OS title bar / native resize borders are gone; the in-app grips restore
  resizing. Double-click on the drag region toggles maximize (handled by Tauri's drag region).
- The bar (and grips) are intentionally absent on the player route to keep playback full-bleed; this is the
  requested "fullscreen hides controls" behavior.

## Next

- This completes the proposed 4-phase UI redesign foundation. Remaining optional polish: home Spotlight
  ambient tint, broader list motion, and any per-screen visual tweaks from user feedback.
