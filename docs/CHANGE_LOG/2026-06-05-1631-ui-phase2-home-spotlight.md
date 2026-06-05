# 2026-06-05 16:31 - UI redesign Phase 2a: Home Spotlight hero

## Changed (`src/components/common/HeroCarousel.vue`)

Turned the home hero into a Plex-Modern-style Spotlight banner:

- **Metadata pills**: replaced the plain `metaLine` text with a wrapped pill row — type (电影/剧集/单集),
  year, `★ rating`, official rating, runtime (`Xh Ym` / `X分钟`), and a `已看 N%` pill for resume items.
- **Action row**: added a primary Play/Continue button and a secondary 详情 button.
  - Primary label is `继续观看` when the item has an in-progress resume position, else `播放`.
  - Primary plays directly: for Movie/Episode it navigates to `/player/{id}?start=<resumeMs>` with the
    item's `server`/`account` source query (switches account first if needed); for Series/BoxSet (not
    directly playable) it opens the detail page instead.
  - Secondary 详情 opens the detail page.
- Kept the existing full-bleed backdrop, logo art, gradient shade, overview clamp, dots, and prev/next.
- Updated the small-height media queries to hide/space the pills/actions appropriately.

## Verification

- `npm run tauri:build` passed (vue-tsc + vite + cargo + package integrity ok). New exe:
  `src-tauri/target/release/emby-player.exe`, last write `2026-06-05 16:30:29`.
- Visual / play-action behavior to be confirmed by running the exe.

## Next

- Phase 2b: detail-page rework (backdrop-first + inline metadata + sectioned cast/seasons/related).
