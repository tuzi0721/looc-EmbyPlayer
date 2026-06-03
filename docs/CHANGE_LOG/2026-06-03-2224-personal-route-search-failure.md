# 2026-06-03 22:24 - Personal route search failure

## Result

- Reran `HILLS_REAL_PERSONAL_ONLY=1` under the stronger route-content assertions.
- The run failed, as intended, instead of accepting weak evidence.

## Evidence

- Backend all-account media/search still worked across 2 accounts and 2 servers.
- History rendered 8 cards with 4 source labels.
- Aggregate rendered 8 cards with 4 source labels.
- Aggregate UI search then rendered 0 search result cards, so the sourced click-through check could not run.
- Temporary credential input was deleted, and no `emby-player.exe` or `mpv.exe` process remained.

## Next

- Fix Aggregate search input handling so the search handler uses the actual input event value before rerunning the real guard.
