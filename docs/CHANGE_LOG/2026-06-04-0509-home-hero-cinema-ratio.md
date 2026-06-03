# 2026-06-04 05:09 - home hero cinema ratio

## Why

The real-account layout smoke still caught a visible home layout defect after the earlier hero work: at `1920x1080`, the home hero used a `16:7` fixed ratio and left only `20px` of the media-library row visible when the real account had a continue-watching row. That did not meet the user's requirement that the hero keep a stable screen-like ratio while still exposing the content rows below it.

## Changed

- Changed `src/components/common/HeroCarousel.vue` from fixed `16:7` to fixed `8:3` across all home hero breakpoints.
- Kept the hero ratio stable across desktop, compact, and short-height window sizes instead of using viewport squeeze rules.
- Left the real media-backed hero data path unchanged: hero items still come from real library candidates, overview, backdrop/primary fallback, and title/logo metadata.

## Verification

- `npm.cmd run build` passed.
- `git diff --check` passed.
- `npm.cmd run tauri:build` passed.
- Tauri package integrity passed with 7 bundled mpv files in `src-tauri\target\release\resources\mpv`.
- Real-account Tauri release layout smoke passed with `ok=true` and `failures=[]`.
- The passing smoke used the release exe at `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`, detected a real Emby server, loaded 5 library views and 36 hero candidates, and measured these home hero aspects:
  - `1920x1080`: hero `1684x632`, aspect `2.667`, first media row visible `203px`.
  - `1366x768`: hero `1130x424`, aspect `2.667`, first media row visible `157px`.
  - `1024x768`: hero `788x296`, aspect `2.667`, first media row visible `203px`.
  - `960x600`: hero `724x272`, aspect `2.667`, first media row visible `137px`.
  - `760x430`: hero `680x255`, aspect `2.667`, first media row visible `95px`.
- The same smoke also rechecked movie and series detail layouts across the same five sizes with no horizontal overflow, no clipped detail title, and exposed below-hero content.
- Temporary credential input was deleted by the smoke script.
- Follow-up process check found no `emby-player.exe` or `mpv.exe`.

## Notes

- The second passing smoke run had `resumeCount=0` because the live test account state changed between runs, so it verified media-library exposure rather than a simultaneous continue-watching plus media-library stack. The pre-fix baseline with `resumeCount=1` failed specifically because the media-library row was only `20px` visible at `1920x1080`; changing the fixed ratio from `16:7` to `8:3` removes about `100px` of hero height at that same content width.
