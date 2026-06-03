# 2026-06-03 22:21 - Personal smoke evidence audit

## Result

- Reran `HILLS_REAL_PERSONAL_ONLY=1` against `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`.
- The run returned `ok: true` with no failures.
- Temporary credential input was deleted, and no `emby-player.exe` or `mpv.exe` process remained.

## Evidence captured

- Isolated smoke config worked: account count was `2`, not the polluted old account set.
- All-account media returned 72 items, all annotated with `_source`, across 2 account sources and 2 server sources.
- Same-name items across different sources were preserved: 31 in the media sample, 1 in resume, 1 in search.
- All-account search returned 2 sourced results.
- Aggregate UI search rendered 2 poster cards with 2 source labels.
- Clicking a sourced search result opened `/item/...` with both `server` and `account` query values.

## Evidence gap

- The route sampling for Favorites, History, and Aggregate reported zero rendered cards.
- The verifier only failed on route errors/no-account prompts, so the `ok: true` result is not strong enough to prove the route pages themselves load visible personal-media content.

## Next

- Tighten the personal-media verifier so History/Aggregate must render visible cards when the backend has resume/history content, then rerun the real guard.
