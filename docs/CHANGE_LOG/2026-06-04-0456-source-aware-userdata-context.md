# 2026-06-04 04:56 - Source-aware user data context

## Result

- Tightened multi-server/account context handling for detail pages opened from all-account surfaces such as favorites, history, aggregate, and search.
- `DetailView` now derives the active server from the route account context instead of implicitly trusting the currently active account.
- Related item navigation from detail pages now preserves the current `account` / `server` query.
- `library.updateItemUserData` now scopes optimistic and server-confirmed user-data updates by account, preventing same item IDs from different accounts/servers from being updated together.
- Favorite and watched toggles now pass the route account into cache updates.

## Verification

- `npm.cmd run build`
- `git diff --check`
- `npm.cmd run tauri:build`
- Tauri package integrity passed with 7 bundled mpv files.

## Notes

- The available real smoke fixture currently logs in one account for the configured server lines, so it cannot prove a true two-account same-ID collision. This phase closes the local cache/context bug by code path and build verification; a future two-account fixture should be used to exercise the collision directly.

## Release exe

- `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Size: `8,668,160` bytes
- Last write time: `2026/6/4 04:56:12`

## Next

- Commit and push this phase.
- Continue the next unresolved UI/data issue from the user's list.
