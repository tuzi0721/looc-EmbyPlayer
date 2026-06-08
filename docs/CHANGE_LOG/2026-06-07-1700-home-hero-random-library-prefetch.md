# 2026-06-07 17:00 - Home hero: random library batch + preload all slides (#3 follow-up)

## Problem

The home hero/spotlight pulled the newest 36 Movie/Series globally (sorted by `DateCreated`), took the first 6,
and mixed in the resume list. The template only rendered the *current* slide's backdrop `<img>`, so advancing
the carousel fetched a fresh ~2200px webp on demand — visibly laggy. The content was also always "the newest",
never varied.

User request: (a) preload all hero posters at once so switching is instant; (b) each visit, pick **one random
media library** and load **5 random items** from it.

## Changed

- `src-tauri/src/emby/models.rs`: `MediaItem` now carries `collection_type` (serde PascalCase → `CollectionType`)
  so the frontend can tell movie/tv libraries apart from music/photo/etc.
- `src/types/models.ts`: added `CollectionType?: string | null` to `MediaItem`.
- `src/stores/library.ts` (`refreshHome`):
  - Pick a random video library (`CollectionType` ∈ {movies, tvshows, mixed, boxsets}) from the user's views.
  - Query it with `Recursive=true&IncludeItemTypes=Movie,Series&SortBy=Random&Limit=8` (over-fetch a few),
    keep visual items, slice to 5 → `heroItems`.
  - Fallback to the previous global newest Movie/Series query when no video library exists or the random query
    fails/empties. Hero no longer mixes the resume list (resume still shows as its own row).
- `src/components/common/HeroCarousel.vue`:
  - `items` now uses only `heroItems` (deduped, sliced to 5); resume no longer appended.
  - New `firstBackgroundUrl(item)` + `preloadHeroBackgrounds()` create `new Image()` for every slide's preferred
    backdrop (same width/params as rendered) to warm the browser HTTP cache. A `watch` on
    `heroImageWidth | item-ids` re-preloads whenever the batch or size changes; references held in a ref so the
    in-flight images aren't GC'd before decoding.

## Effect

- Each home visit / account switch shows a fresh random batch of 5 items from a random video library.
- All 5 backdrops are fetched up front, so carousel navigation (auto-advance, arrows, dots) shows instantly
  from cache instead of fetching on switch.

## Verification

- `npm run build` (check:local-decode + check:no-planned-ui + vue-tsc --noEmit + vite build) passed.
- `cargo check --features mpv-embedded` finished clean (exit 0).
- Full `npm run tauri:build` + interactive run to be done together with the next round (#1 fullscreen controls).

## Next

- Continue with #1 (fullscreen controls still not reliably revealing / progress bar reachability), then one
  combined release build + run to verify both.
