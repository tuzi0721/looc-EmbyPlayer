# 2026-06-05 16:21 - UI redesign Phase 1: design tokens + cards + sidebar polish

## Context

Per the approved `docs/UI_REDESIGN_PROPOSAL.md` (dark cinematic default, soft-daylight light, artwork-first),
Phase 1 = low-risk foundation: design-token scale, unified card hover/radius, sidebar active state.

## Changed

- `src/styles/theme.css`
  - Dark base refined to `#0b0b0f`; text contrast bumped (primary `.95`, secondary `.66`, tertiary `.45`).
  - Added a spacing scale (`--sp-1..--sp-12`), radius scale (`--r-card:14px`, `--r-lg:20px`, `--r-pill`),
    elevation tokens (`--shadow-card`, `--shadow-pop`), and an `--ambient` color (defaults to accent; used
    later for backdrop color extraction).
  - Light theme gets matching `--shadow-card`/`--shadow-pop`/`--ambient` overrides (softer shadows).
- `src/components/common/PosterCard.vue`
  - Card art uses `--r-card` and the shared `--shadow-pop` on hover/focus; hover lift increased to
    `translateY(-4px) scale(1.04)` with a stronger border; keyboard focus-visible mirrors hover.
  - Watched badge now uses `--accent` (was a hard-coded blue).
- `src/components/common/AppSidebar.vue`
  - Active nav item gets a left accent indicator bar (pill) and bolder weight, in addition to the existing
    soft-accent background.

## Notes

- Default theme is already `dark` (settings store default `theme: "dark"`; `data-theme="light"` only applied
  when light), so "dark as default" is satisfied.
- These are additive/low-risk visual changes; deeper structure (Home Spotlight, detail-page rework, ambient
  color extraction) is Phase 2/3 per the proposal.

## Verification

- `npm run tauri:build` passed (vue-tsc type-check + vite + cargo + package integrity ok). New exe:
  `src-tauri/target/release/emby-player.exe`, last write `2026-06-05 16:20:12`.
- Visual polish to be confirmed by running the exe.

## Next

- Commit/push. Then Phase 2: Home Spotlight banner + detail-page rework (backdrop-first + inline metadata).
