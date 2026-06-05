# 2026-06-05 16:56 - UI redesign Phase 3: backdrop ambient color + hero motion

## Changed

- `src/utils/dominantColor.ts` (NEW)
  - `extractDominantColor(url)`: samples a 24x24 canvas copy of an image and averages the meaningful
    (non-near-black/white) pixels to a dominant `rgb`. Uses `crossOrigin="anonymous"`, a 6s load guard, and a
    try/catch around `getImageData` so a tainted canvas (no CORS) resolves to `null`. Results cached per URL.
    `rgbToCss(rgb, alpha)` helper.
- `src/views/DetailView.vue`
  - Extracts the dominant color from the active backdrop and exposes it as `--detail-ambient` (falls back to
    the theme `--ambient`/accent when extraction is blocked).
  - `.detail` background now layers a soft radial glow tinted with `--detail-ambient` (via `color-mix`) over
    the base surface, painted on the scroll container so it stays as a top ambient while content scrolls —
    the page picks up the artwork's color below the hero (Plex "Artwork Colors" style).
  - Added a subtle `detail-hero-rise` fade-up entrance for the hero content (`.hero__main`), disabled under
    `prefers-reduced-motion`.

## Notes

- Color extraction degrades gracefully: servers without image CORS simply fall back to the accent tint, so
  this never breaks the page. (Account 2's Cloudflare Worker sends `Access-Control-Allow-Origin: *`; other
  servers vary.)

## Verification

- `npm run tauri:build` passed (vue-tsc + vite + cargo + package integrity ok). New exe:
  `src-tauri/target/release/emby-player.exe`, last write `2026-06-05 16:55:58`.
- Visual (ambient tint per title + hero entrance) to be confirmed by running the exe.

## Next

- Optional: extend ambient tint to the home Spotlight; broader staggered list motion; Phase 4 window
  min/max/restore controls.
