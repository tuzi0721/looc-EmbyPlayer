# 2026-06-04 07:14 - Full smoke playback window regression

## Result

Full real-account Tauri release smoke still failed after the fixed-item playback pass.

## Evidence

- Real login, server detection, home loading, movie detail layout, and series detail layout ran.
- Fixed-item command-only playback remains valid, but the full flow failed after the detail/series playback probe:
  - detail play click still missed the actual play button and hit the detail root instead of the button
  - main playback route opened through the DOM fallback
  - selected real movie item was `21648`
  - player did not expose playback state
  - screenshots stayed black / blank across `1366x768`, `960x600`, and `760x430`
  - output contained mpv IPC pipe-closing warnings
  - user-visible desktop showed an extra empty playback window with mpv idle text, which is not acceptable embedded playback
- Cleanup found no remaining `emby-player.exe` / `mpv.exe` after the smoke runner force-cleaned the launched process tree.

## Remaining failures reported by the smoke

- `/history`: visible cards did not load images.
- `/aggregate`: visible cards did not load images.
- Search did not return the selected real item.
- Full-flow playback did not become ready and had no usable aspect evidence.
- Runtime cleanup status stayed false because the launched desktop process needed cleanup.

## Next

- Stop the full smoke from opening a real playback route as a preparatory series/detail probe before the main playback validation, or isolate that probe in a separate process.
- Fix real pointer hit testing for detail play buttons so CDP/user clicks reach the button itself.
- Rerun full real-account smoke after the probe isolation change.
