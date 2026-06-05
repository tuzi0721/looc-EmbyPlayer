# 2026-06-05 18:41 - Revert to system title bar + light-theme hero original colors

## Context

User feedback after running the release: the custom undecorated title bar made the normal
minimize/maximize/close behavior awkward (and it was hidden on detail/player), and the giant hero artwork
was darkened by a full mask in light mode.

## Changed

- `src-tauri/tauri.conf.json`: `decorations` back to `true` (system title bar everywhere — normal
  min/max/close on all pages, auto-hidden by the OS in fullscreen).
- `src/App.vue`: removed the custom `WindowTitleBar` usage (import / computed / element). The `.app-body`
  wrapper is kept (harmless).
- Deleted `src/components/common/WindowTitleBar.vue`.
- `src/views/DetailView.vue` and `src/components/common/HeroCarousel.vue`: added light-theme `.hero__shade`
  overrides that keep the backdrop's real colors vibrant — only a soft bottom/left gradient remains for text
  legibility (instead of a full dark mask), fading into the page background.

## Verification

- `npm run tauri:build` passed (vue-tsc + vite + cargo + package integrity ok). Rebuilt
  `src-tauri/target/release/emby-player.exe`.

## Remaining user-reported issues (next)

1. Fullscreen player controls/keys not operable.
2. Add a buffering/loading indicator.
3. Posters load very slowly.
4. Cannot delete a saved server.
5. (window controls) — addressed by this revert.
6. Video occupies only a small area at some window sizes (native rect / DPI).
7. (light hero original colors) — addressed by this change.

## Next

- Investigate #6 (native window rect / DPI scaling) and #1 (fullscreen control hit-testing), then #4 / #2 / #3.
