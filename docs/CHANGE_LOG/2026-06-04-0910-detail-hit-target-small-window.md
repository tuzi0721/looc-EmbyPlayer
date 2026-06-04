# 2026-06-04 09:10 - Detail play hit target in small windows

## Changed

- `src/views/DetailView.vue`
  - Adjusted the short-window detail hero layout so `.hero__body` starts content at the top of its grid instead of centering it vertically.
  - This prevents the main detail action stack from being pushed outside the visible hero area at very small window heights, where real clicks could hit `SECTION.hero` instead of the play button.
- `scripts/real-server-visual-smoke.mjs`
  - Made `HILLS_REAL_HIT_TEST_ONLY=1` resize the native Tauri root window directly before measuring hit targets.
  - Expanded hit-test-only coverage to `1366x768`, `960x600`, and `760x430` for both a real movie detail page and a real series detail page.

## Verification

- Passed:
  - `node --check scripts\real-server-visual-smoke.mjs`
  - `git diff --check`
  - `npm.cmd run build`
  - `npm.cmd run tauri:build`
- Real-account Tauri release hit-test-only smoke passed:
  - `ok=true`
  - `failures=[]`
  - Tested real movie item `21648` and real series item `34743`.
  - At `1366x768`, `960x600`, and `760x430`, the play-button center hit `.hero__play`.
  - The left/right inside points also resolved inside the same play button, including SVG-icon hits nested under `.hero__play`.
- New release exe built:
  - `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
  - Tauri package integrity passed with 7 bundled mpv files.

## Cleanup

- Temporary real-smoke credential input was removed.
- Temporary real-smoke artifact directory was removed.
- Follow-up process check found no `emby-player.exe` or `mpv.exe`.

## Not Covered

- This was a focused hit-target fix, not a full playback pass.
- The full real-account smoke still needs to be rerun after the next playback/runtime fixes.
- The user's screenshot showing an independent empty playback window remains part of the next full-flow investigation.

## Next

- Continue with the full-flow playback failures: black/no-state player cases, the independent empty playback window path, and normal runtime close semantics.
