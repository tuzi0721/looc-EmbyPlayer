# 2026-06-07 19:30 - Player controls overlay window (slice 1: titlebar + transport)

## Why

The native mpv child window (`WS_CHILD` via `--wid`) sits above the WebView in z-order and runs on its own
thread; its `WM_NCHITTEST → HTTRANSPARENT` passthrough is unreliable across threads/WebView2, so the in-DOM
player controls were only "sometimes" clickable and the progress bar was effectively undraggable; fullscreen had
no reachable controls and felt impossible to close. The user's reference app (Hills Lite v0.3.0, Flutter +
media_kit + a separate Qt/QML player) avoids this by compositing controls over a video texture / using a
dedicated player window. We can't texture-composite in a WebView, so we adopt the dedicated-window idea: a
separate transparent, always-on-top window hosts the controls and floats above mpv.

## Approach (agreed slice 1: title bar + transport; panels later)

- `src-tauri/tauri.conf.json`: added a second static window `overlay` (`transparent`, `decorations:false`,
  `alwaysOnTop`, `skipTaskbar`, `focus:false`, `visible:false`, `url:"/?overlay=1"`). Main window now has an
  explicit `"label": "main"`.
- `src-tauri/capabilities/default.json`: applies to `["main","overlay"]`; added window perms needed for
  positioning/driving windows (`set-position`, `set-size`, `inner-position`, `inner-size`, `outer-*`,
  `set-always-on-top`, `is-fullscreen`, `is-maximized`, `scale-factor`).
- `src/App.vue`: when `?overlay=1`, renders ONLY `<PlayerOverlay/>` and skips all app-shell bootstrapping.
- `src/views/PlayerOverlay.vue` (new): the controls UI for the overlay window — custom title bar (back +
  min/max/close that drive the `main` window), bottom transport (play/pause, ±10s, **draggable progress**, time,
  volume, fullscreen), center-click toggles play, buffering spinner, auto-hide. It reads mpv state via
  `api.getState()` polling and issues `api.pause/resume/seek/seekRelative/setVolume/setMuted`; higher-level
  actions (back / toggle-fullscreen) are sent to `main` via the `overlay:cmd` event; it listens to `overlay:sync`
  for title/fullscreen state. The overlay window's html/body/#app are forced transparent so mpv shows through.
- `src/views/PlayerView.vue`: when `overlayActive = embedVideo && hasTauriRuntime()`:
  - mpv now fills the whole stage (`currentEmbedRect` skips the in-DOM control reservation);
  - on embedded host show, position the overlay over the main window's client area
    (`innerPosition`/`innerSize`), show it always-on-top, then refocus `main` so keyboard shortcuts keep working;
  - keep the overlay aligned via `main.onMoved/onResized` + re-sync on fullscreen toggle;
  - emit `overlay:sync` (title/subtitle/fullscreen/maximized) and handle `overlay:cmd` (back/toggle-fullscreen);
  - in-DOM `.player__top/.player__bottom` are hidden; the legacy pointer-poll reveal is skipped;
  - on error, the overlay is hidden so the main error dialog is visible, then restored.
  Electron/web (no Tauri runtime) keep the old in-DOM controls unchanged.

## Build / run

- `npm run build` (vue-tsc + vite) ok; `npx tauri build --features mpv-embedded` ok (capabilities + 2nd window
  validated, cargo 3m47s, 8.33 MB exe with embedded dist). App relaunched; no stray transparent window at
  startup (overlay stays hidden until playback).

## To verify (user)

- Play an item: controls should float over the full-size video; the **progress bar drags**, play/seek/volume
  work, and **close/min/max** work (overlay title bar + system title bar). In **fullscreen**, controls reveal on
  mouse move and back/exit work.
- Known limitation (slice 1): audio/subtitle/danmaku/episode panels are not yet in the overlay, so they're
  temporarily unavailable during embedded playback (next slice). Risk being verified: that a transparent
  always-on-top window reliably floats above the native mpv child and shows it through; if not, fall back to a
  dedicated player window / transparent main window.

## Next

- If the overlay floats correctly: port the panels (tracks/subtitle/danmaku/episodes) into the overlay; then
  resume the UI look pass (home/detail/version colors) referencing the running Hills Lite app.
