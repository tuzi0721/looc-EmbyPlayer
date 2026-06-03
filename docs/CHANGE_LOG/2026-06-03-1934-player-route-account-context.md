# 2026-06-03 19:34 - Player route account context

## Changed
- Preserved `account` and `server` query context when navigating from detail pages to the player.
- Player startup now switches to the route account before loading/playing server media.
- Player item cache lookups and loads now use the route account context, so direct `/player/:id?account=...` entry and cross-server favorite/history/search playback keep the intended server/account owner.

## Verification
- `npm.cmd run build`

## Next
- Commit/push this phase, rebuild the packaged release exe, then continue remaining real UI/playback issues.
