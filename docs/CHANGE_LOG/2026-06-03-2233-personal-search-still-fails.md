# 2026-06-03 22:33 - Personal search still fails after release

## Result

- Rebuilt release with Aggregate search input handling and reran `HILLS_REAL_PERSONAL_ONLY=1`.
- The run still failed at Aggregate UI search.

## Evidence

- Backend all-account media/search worked across 2 accounts and 2 servers.
- History rendered 8 cards with 4 source labels.
- Aggregate rendered 8 cards with 4 source labels.
- Aggregate UI search rendered 0 result cards, so sourced click-through could not run.
- Temporary credential input was deleted, and no `emby-player.exe` or `mpv.exe` process remained.

## Next

- Improve the verifier's UI input event to use the native input setter, focus, `InputEvent`, `change`, and a longer wait loop. This distinguishes a weak automation event from a real Aggregate search bug.
