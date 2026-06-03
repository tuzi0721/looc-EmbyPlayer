# 2026-06-03 21:58 - All-account personal media entry gate

## What changed

- Changed Favorites, History, and Aggregate views to treat the presence of any saved account as the load gate instead of requiring `auth.activeAccount`.
- Added account-list signature watches so all-account personal views refresh when accounts are added, removed, or refreshed, not only when the active account id changes.
- Kept source-aware navigation alive even if the immediate active-account switch fails, so a favorite/history/search item can still route with its original `server/account` query context and let the detail page resync.

## Why

The backend all-account media path already annotates items with `_source`, and the frontend item key already includes `serverId:accountId:itemId`. The page-level active-account gate could still hide cross-server favorites/history/search results after server switching or stale active-id state.

## Verification

- `npm.cmd run build`
- `git diff --check`

## Next

- Continue validating real-account multi-server personal-media behavior and then move to the next user-visible playback/layout issue.
