# 2026-06-03 19:17 - Light theme surfaces

## Changed
- Improved light-theme readability for shared controls and settings surfaces.
- Added light-mode surface states for sidebar/topbar buttons, server rows, inputs, tabs, notification items, server avatars, active rows/tabs, and add-server modal overlays/footers.

## Verification
- `npm.cmd run build` passed before this log entry after the theme CSS change.

## Next
- Commit/push this phase, then rebuild the packaged release exe so the light-theme fix is included in the user-facing binary.
