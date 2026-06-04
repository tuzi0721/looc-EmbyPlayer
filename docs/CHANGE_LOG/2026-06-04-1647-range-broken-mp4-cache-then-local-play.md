# 2026-06-04 16:47 - Range-broken MP4: cache to local file, then play (fixes black screen)

## Problem

Range-broken + non-faststart MP4/MOV sources (server returns HTTP `200` with no `Content-Range`, and the
`moov` index atom is at the tail) cannot be streamed: mpv can't seek to the tail to read the index, so the
player stayed black. The previous behavior hard clear-blocked (`play:blocked-range-broken-mp4`) with an
error. Option D (find a Range-capable server endpoint) was proven dead (Range is stripped at the
proxy/WAF). The robust fix without server transcoding is to download the file sequentially (no Range needed)
to a local cache file and play the local copy, which supports seeking on disk.

## Changed

- `src-tauri/src/mp4_prefetch.rs` (NEW)
  - `PrefetchManager`: downloads a source sequentially to a dedicated cache dir
    (`%TEMP%/hills-lite-stream-cache`), tracks progress (`downloaded/total/ready/localPath/error`), and
    exposes `start` / `snapshot` / `cancel`. `cancel` aborts the task and deletes the cache file(s).
- `src-tauri/src/commands/player.rs`
  - `select_playback_line` now returns a `PlaybackPlan` (`Stream` or `CacheThenLocal`). For Range-broken +
    non-faststart sources with no streamable line it returns `CacheThenLocal(best_line)` instead of erroring.
  - `play` branches: `CacheThenLocal` starts the prefetch and returns a `prefetching` result
    (`PlaybackSourceResult.prefetching = true`) via the new `start_prefetch_result` helper.
  - New commands `get_prefetch_state` and `cancel_prefetch`.
- `src-tauri/src/state.rs`, `src-tauri/src/lib.rs`
  - Added `PrefetchManager` to `AppState`, registered the two commands, and cancel prefetch in
    `shutdown_playback`.
- `src/api/index.ts`, `src/stores/player.ts`
  - Added `PrefetchState` type, `prefetching` flag on `PlaybackSource`, `getPrefetchState`/`cancelPrefetch`
    wrappers. The player store skips mpv polling while `prefetching`.
- `src/views/PlayerView.vue`
  - When `play` returns `prefetching`, `waitForPrefetchAndPlayLocal` polls `getPrefetchState`, shows a
    "正在缓存以便播放 X%" progress overlay, and once ready plays the local cache file via `playFile`.
  - Teardown calls `cancelPrefetch` (cache file deleted when leaving the player).

## Verification

- `cargo fmt --check`, `cargo check --features mpv-embedded` — passed.
- Lints on changed Rust/TS/Vue files — clean.
- `npm run tauri:build` — passed; package integrity ok (7 bundled mpv files).
  - Release exe rebuilt (`src-tauri/target/release/emby-player.exe`).
- Real-account Tauri release FULL smoke on the Range-broken mp4 item `34817` (`yuanshen.help`):
  - The backend took the cache-then-local path (no `blocked-range-broken-mp4`).
  - After the cache download completed, mpv played the LOCAL file with REAL state:
    `durationMs=1420053` (~23.7 min), `positionMs` advancing, `trackCount=2`, video `H.264`, audio `AAC`,
    `1920x1080` 16:9, hardware `d3d11/nv12` decode, and native frame `pixelOk=true` (visible, not black).
  - Runtime cleanup: `electronExited=true`, `remainingCount=0`.
  - The smoke's overall `ok=false` is only because its initial ready-wait window (~8s) elapses before a
    ~24-minute 1080p episode finishes downloading; the later captures show full, real playback. For
    Range-broken tail-`moov` sources, start time is bounded by download time (unavoidable without Range),
    which is exactly why the UI shows a caching progress overlay instead of a black screen.
- Temp artifacts, cache files, and credential input cleaned; no residual `emby-player.exe`/`mpv.exe`.

## Next

- Optional: report Emby playback progress for cached-local playback (currently treated as a local file, so
  server-side resume isn't updated). Consider a size/progress cap UX. Otherwise the black-screen root cause
  for Range-broken MP4 is resolved.
