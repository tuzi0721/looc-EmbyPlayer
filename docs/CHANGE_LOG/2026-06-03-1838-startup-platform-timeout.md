# 2026-06-03 18:38 startup platform timeout

## Changed

- Changed the startup platform detection in `App.vue` so it no longer blocks server/account/settings bootstrap.
- The Windows platform CSS class now applies in parallel with the normal bootstrap work and has a 1.5 second timeout.

## Why

- The platform check is only cosmetic.
- If the Tauri OS plugin call hangs or is slow, the app should still send the real startup requests instead of appearing frozen with no backend activity.

## Verification

- `npm.cmd run build`
  - local-decode guard passed
  - no-planned-ui guard passed
  - TypeScript check passed
  - Vite production build passed

## Next

- Rebuild the packaged release or continue checking other startup-only blocking paths if the user still sees an immediate unresponsive window.
