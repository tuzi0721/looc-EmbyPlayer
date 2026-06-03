# Real smoke skip clear-block item (2026-06-04 03:18)

## Goal

- Stop normal real playback validation from repeatedly selecting the known Range-broken MP4 item `34535`.
- Keep `34535` available as an explicit clear-block regression case.

## Changes

- `scripts/real-server-visual-smoke.mjs`
  - Added `HILLS_REAL_SKIP_ITEM_IDS`.
  - Automatic playback candidate selection now skips those ids in both command-only and full visual paths.
  - Explicit `HILLS_REAL_ITEM_ID` / fifth input-file line still wins, so fixed-item regression runs are unaffected.
  - `input-read` stage now reports whether a requested item and skipped-item list were supplied.

## Verification

- `node --check scripts\real-server-visual-smoke.mjs`
- `git diff --check`
- Real release smoke, command-only, with `HILLS_REAL_SKIP_ITEM_IDS=34535`
  - `ok=true`, `failures=[]`
  - Selected real item: `34503`
  - PlaybackInfo: `DirectPlay`, selected source `mp4`, `hevc/aac`, `1920x1080`, `supportsTranscoding=false`
  - Embedded playback reached `play:mpv-load-start`, `play:mpv-load-complete`, and `play:return`
  - Controls passed: pause, resume, seek forward, seek backward
  - DOM bottom controls were visible and in viewport
  - Frame evidence passed on attempt 3: `1920x1080`, aspect `1.7778`, content aspect `1.7814`, `pixelOk=true`
  - No top-level external `mpv.exe`; only the app window was present
  - Cleanup left `mpvProcessCount=0`
- Real release smoke, command-only, fixed item `34535` with `HILLS_REAL_EXPECT_CLEAR_BLOCK=1`
  - `ok=true`, `failures=[]`
  - Clear-block error was shown with `下载后播放`
  - Backend did not reach mpv load
  - `backendReachedLoad=false`, `backendCompletedLoad=false`, `clearBlockOk=true`
  - Cleanup left `mpvProcessCount=0`
- Temporary credential input files were deleted.
- Follow-up process checks found no `emby-player.exe` or `mpv.exe`.

## Notes

- Line 1 was reported down in the real smoke runs; line 2 was healthy and selected for login/playback.
- The passing `34503` case still came from a no-Range MP4, but its prefix metadata was streamable (`moov=true`), so local mpv playback worked without server transcoding.
