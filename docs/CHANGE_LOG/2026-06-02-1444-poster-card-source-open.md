# 2026-06-02 14:44 Poster Card Source Open

## Scope
- Added an explicit `activateHandler` callback to `PosterCard` so card activation can call the owning view's open action directly while still emitting the existing `activate` event for compatibility.
- Switched media-list cards in Favorites, History, Aggregate, Home search, Library, Genre, Person, and Studio views to the explicit activation callback.
- Kept cross-server item routing through `openMediaItemFromSource`, preserving source server/account query values for duplicate item names or IDs.

## Verification
- `node --check scripts\smoke-electron-home-hero.mjs`
- `node --check scripts\real-server-visual-smoke.mjs`
- `npm.cmd run build`
- `node scripts\smoke-electron-home-hero.mjs`

## Result
- Local Electron smoke returned `ok: true`.
- The smoke used real mouse dispatch against cross-server Favorites and History cards, confirmed the active account switched to the clicked item source, and confirmed the detail route retained `server` and `account` query values.

## Notes
- No credentials, tokens, complete server URLs, or playback URLs are recorded in this log.
- The real playback visual smoke already waits for player visual readiness and then waits an additional 5 seconds before screenshot capture; that behavior remains in place for the next real-server pass.
