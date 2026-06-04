# 2026-06-04 08:11 - Real personal images pass

## What changed

- Fixed media image URL generation for the Tauri release runtime.
- `mediaImages.ts` no longer treats Tauri's compatibility bridge as the Electron `hills-image://` cache protocol.
- Emby/Jellyfin image URLs now receive the current account access token when using normal HTTP image endpoints.
- `PosterCard` resolves the image account from each item's `_source.accountId`, so history, aggregate, and search cards can load images from the server/account that produced the item.
- Home hero, detail hero, and player backdrop helpers now pass the active route/account token into shared image URL helpers.
- History and aggregate all-account cards are eager-loaded so real visual smoke can verify visible images deterministically.
- Strengthened `scripts\real-server-visual-smoke.mjs` personal-media assertions to count loaded and broken image elements for history, aggregate, and aggregate search.

## Verification

- `npm.cmd run build`
- `node --check scripts\real-server-visual-smoke.mjs`
- `git diff --check`
- `npm.cmd run tauri:build`
- Real-account Tauri release personal-only smoke:
  - `ok=true`, `failures=[]`
  - line 2 detected healthy Emby; line 1 reported down
  - two accounts logged in and preserved source metadata
  - backend all-account media count `72`, annotated `72`, source account count `2`
  - `/history`: `posterCount=8`, `imageCount=4`, `loadedImageCount=4`, `brokenImageCount=0`, source labels present
  - `/aggregate`: `posterCount=8`, `imageCount=4`, `loadedImageCount=4`, `brokenImageCount=0`, source labels present
  - aggregate search: `posterCount=2`, `loadedImageCount=2`, `brokenImageCount=0`, source labels present
  - clicked search result preserved `server/account` query and matched the active account
  - temporary credential input file was removed
  - reported smoke artifact directory no longer existed
  - follow-up process check found no `emby-player` or `mpv`

## Note

This phase only closes the Tauri release image-loading path for personal/all-account surfaces. The user-provided screenshot still shows a separate empty mpv window in a playback scenario; that is a separate playback/embed regression and remains the next priority.

## Next

- Investigate why a playback action can still spawn an independent empty mpv window instead of using only the embedded host.
- Continue full real-account smoke failures after the personal image path is green.
