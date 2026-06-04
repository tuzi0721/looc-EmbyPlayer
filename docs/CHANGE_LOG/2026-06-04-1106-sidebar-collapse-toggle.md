# 2026-06-04 11:06 - Sidebar Collapse Toggle

## Changed

- Split desktop sidebar persistence from the small-window auto-collapse state.
- Small windows now default to the 64px collapsed rail, but the hamburger button can temporarily expand the full 220px sidebar as an overlay.
- Added a backdrop scrim for the small-window expanded sidebar; clicking it or changing routes closes the overlay.
- Preserved desktop behavior: the hamburger button still toggles the persistent 220px/64px sidebar state without showing a scrim.

## Verification

- `npm.cmd run build`
- `git diff --check`
- Browser verification against `http://127.0.0.1:1420/`:
  - `760x430`: initial sidebar `64px`, click hamburger -> `220px` overlay with `scrim=1` and `aria-expanded=true`, click scrim -> `64px` with `scrim=0`.
  - `1280x720`: initial sidebar `220px`, click hamburger -> `64px` with `scrim=0`, second click restored `220px`.

## Notes

- This phase only changes shell/sidebar behavior. It does not touch playback, server login, media data loading, or notification persistence.
