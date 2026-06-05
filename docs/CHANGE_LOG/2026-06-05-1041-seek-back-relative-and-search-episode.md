# 2026-06-05 10:41 - Fix seek-back nudge (relative) and smoke search for episodes

## Changed

- `src/views/PlayerView.vue`
  - `nudgeSeek` now seeks RELATIVE to the player's real current position instead of an absolute target
    computed from the store's cached `positionMs`. Native mpv uses `player.seekRelative(deltaMs)` (the
    backend computes from mpv's actual position); HTML video uses the `<video>` element's live
    `currentTime`. The non-seekable guard (`seekAvailable`) is unchanged, so disabled state is still
    respected. This avoids a wrong jump when the cached store position is stale (e.g. right after a
    programmatic seek or a server resume).
- `scripts/real-server-visual-smoke.mjs`
  - The search assertion now searches the parent SERIES name when the selected item is an Episode (Emby
    search returns Movies/Series, not Episodes by episode title), so the search check reflects real,
    searchable content.

## Why

A full real-account smoke surfaced two failures that were measurement/harness artifacts, not playback bugs:
- "seek back did not move playback backward": the smoke seeked to 15s via a direct `api.seek` (bypassing the
  player store), then clicked the seek-back button; `nudgeSeek` used the store's stale `positionMs` (~224s,
  the item had a server resume position) and absolute-seeked to ~214s. Using a relative seek fixes both the
  real-usage edge case and the smoke.
- "search did not return the selected real item": the selected item was an Episode, which Emby search does
  not return by episode title.

## Verification

- `node --check scripts\real-server-visual-smoke.mjs`, lints (PlayerView.vue) — passed.
- `npm run tauri:build` (package ok) — passed.
- Real-account full smoke (account 1, item `34817`):
  - `search-complete count=1` (was `0`).
  - `seek-back-complete beforePositionMs=15244 afterPositionMs≈4600-4900` (correctly moved back ~10s; was
    jumping forward to ~214s).
- The remaining smoke red is ENVIRONMENTAL: the native-window screenshot check failed because a desktop game
  window ("Zombie Invade 100 Days", PID 30032 / java.exe) was covering the capture coordinates
  ("native capture center is covered by process ... outside launched process tree"). Real embedded playback
  (mpv ready, real frames, direct streaming) was already proven in the 18:10 phase.

## Next

- Commit/push. Account-2 `/smartstrm` remains a server-config item (SmartStrm 302 proxy not in the Worker
  path).
