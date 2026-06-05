# 2026-06-05 16:41 - UI redesign Phase 2b: detail-page cinematic polish

## Context

`DetailView.vue` already had a backdrop-first hero with actions, genre tags, meta, studios, playback panel,
overview and (below) cast/seasons/related sections. Phase 2b focuses on the visible gaps: blending the
backdrop into the page and unifying the inline metadata as pills.

## Changed (`src/views/DetailView.vue`)

- `.hero__shade`: the vertical gradient now fades the bottom of the backdrop into the PAGE background
  (`var(--bg-base)`) instead of to near-transparent, so the hero artwork seamlessly melts into the content
  below — in both dark and light themes (theme-aware via the token). The left/bottom dark gradients are
  kept so the title/actions stay readable.
- `.hero__meta`: the inline metadata items are now rendered as consistent **pills** (matching the home
  Spotlight pill style) instead of plain dotted text.

## Notes

- The detail page's structure (backdrop-first, action area, genre pills, studios, version/audio/subtitle
  selectors, cast/seasons/related sections) was already in place; this phase is a cinematic/consistency
  polish rather than a structural rewrite. Further per-section polish can iterate on visual feedback.

## Verification

- `npm run tauri:build` passed (vue-tsc + vite + cargo + package integrity ok). New exe:
  `src-tauri/target/release/emby-player.exe`, last write `2026-06-05 16:40:55`.
- Visual result to be confirmed by running the exe (movie + series detail).

## Next

- Iterate on detail-page sections per visual feedback, or proceed to Phase 3 (ambient backdrop color
  extraction + motion polish) / Phase 4 (window min/max/restore controls).
