# 2026-06-03 18:14 - personal media portrait cards

## Context

- The reported UI issue included favorites/history episode artwork loading poorly and card sizes looking inconsistent.
- Favorites, history, aggregate overview, and aggregate search were rendering mixed movies/series/episodes as backdrop cards.
- Episode backdrop/thumb availability is less consistent than primary/poster artwork, and wide cards make compact layouts more fragile.

## Changes

- Switched favorites cards from `backdrop` to `portrait`.
- Switched history cards from `backdrop` to `portrait`.
- Switched aggregate resume/favorites/history/search cards to `portrait`.
- Tightened desktop and compact grid widths for these portrait cards.

## Verification

- First `npm.cmd run build` hit the known intermittent Vite/Rollup absolute `index.html` emit error after local guards passed.
- Immediate rerun of `npm.cmd run build` passed.
- `git diff --check` passed.

## Next

- Continue remaining layout/fullscreen issues and any user-visible playback output checks.
