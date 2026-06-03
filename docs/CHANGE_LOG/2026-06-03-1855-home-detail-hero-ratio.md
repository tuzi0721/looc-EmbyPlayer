# 2026-06-03 18:55 home/detail hero ratio

## Changed

- Updated the home hero carousel to use a stable `16 / 7` visual ratio with viewport caps instead of scattered fixed-height clamps.
- Updated the detail hero to use a stable wide hero ratio with viewport caps, reducing the full-screen empty vertical space and leaving the overview/media sections visible sooner.
- Kept the home hero click-to-open behavior unchanged.

## Verification

- `npm.cmd run build`
  - local-decode guard passed
  - no-planned-ui guard passed
  - TypeScript check passed
  - Vite production build passed

## Next

- Run a real-account layout metric pass over multiple viewport sizes and continue tuning any remaining visual issues.
