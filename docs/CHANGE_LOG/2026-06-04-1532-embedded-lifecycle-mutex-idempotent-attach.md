# 2026-06-04 15:32 - Embedded lifecycle mutex + idempotent attach + ordered teardown

## Changed

- `src-tauri/src/mpv/ipc.rs`
  - `MpvIpcBackend` gains two fields: `current_parent: Arc<Mutex<Option<isize>>>` (the native parent the
    host child is attached to) and `lifecycle: Arc<tokio::sync::Mutex<()>>` (serializes destructive
    embedded-lifecycle operations).
  - `bind_embedded` is now `async` and idempotent: when the same parent window already has a live host
    child, the existing host AND any running mpv session are reused unchanged. Only when there is no host
    or the parent actually changed does it tear down — and it now stops mpv FIRST (`shutdown().await`),
    then destroys the old host window, so mpv never renders into a destroyed `--wid`.
  - `ensure_started` keeps a lock-free hot path (a live mpv session returns immediately, so the parallel
    snapshot fan-out is not serialized). Only the spawn slow-path takes the `lifecycle` lock, re-checks
    state after acquiring it, then spawns mpv. This makes the mpv spawn mutually exclusive with
    attach/detach.
  - `detach_embedded` now takes the `lifecycle` lock and clears `current_parent`.
  - Added `parent_key(&ParentHandle) -> Option<isize>` helper for parent comparison.
- `src-tauri/src/mpv/manager.rs`
  - `MpvManager::bind_embedded` is now `async`; the IPC backend Arc is cloned out of the `RwLock` read
    guard before awaiting, so no sync lock is held across `.await`.
- `src-tauri/src/commands/player.rs`
  - `embed_attach` awaits the now-async `bind_embedded` directly inside the existing 8s timeout.

## Why

Root cause from the 15:20 diagnosis: `bind_embedded` was unconditionally destructive and there was no
serialization between attach (`bind_embedded`), play (`ensure_started` spawning mpv with `--wid`), and
detach. In full-flow navigation, an overlapping re-attach/detach killed the mpv child mid-load
(`mpv ipc write failed: pipe is being closed`) and/or destroyed the host window under a live `--wid`,
producing the black player. Command-only smoke has no overlap, so it passed. The idempotent re-attach (the
Tauri main window HWND is stable across PlayerView re-mounts) plus the lifecycle mutex remove both races.

## Verification

- `cargo fmt --manifest-path src-tauri\Cargo.toml --check` — passed.
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets` — passed (default features).
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded` — passed (release feature).
- `node --check scripts\real-server-visual-smoke.mjs` — passed.
- `git diff --check` — passed (CRLF normalization warnings only).
- `npm run tauri:build` — passed; package integrity ok (7 bundled mpv files).
  - Release exe: `src-tauri/target/release/emby-player.exe`, last write `2026-06-04 15:31:46`,
    size `8,702,976` bytes.

## Real-account full smoke (race fix validated; stream readiness still red)

User supplied credentials; ran `HILLS_REAL_APP_MODE=tauri-release` full smoke against the new exe with two
accounts. Credentials were passed via a `.tmp` input file that the smoke deletes after reading; temp
artifact dirs and the input file were cleaned afterward, and no `emby-player.exe`/`mpv.exe` remained.

- Account 2 (`yl1/yl.cnmbyd.xyz`, two lines): server was degraded this run — first attempt threw a
  `network error` on `Items/.../PlaybackInfo`; second attempt completed the full flow but the websocket
  reported `502 Bad Gateway`. Selected source was a `3828x1596 HEVC/eac3` DirectPlay file.
- Account 1 (`yuanshen.help`): detection healthy; selected source was `mp4 h264/aac 1920x1080` DirectPlay.

Both runs: the EMBEDDED LIFECYCLE RACE IS GONE.
- No `mpv ipc write failed: pipe is being closed` anywhere in either log.
- No `embed_attach:timeout` / `embed_visible:timeout` / "host show timed out".
- `mpvStateTimedOut: false` at every player-state probe (IPC stayed responsive through the whole flow,
  navigation, and all resize checks).
- `runtimeCleanup`: `electronExited=true`, `remainingCount=0`, `ok=true` (clean teardown; the historical
  `electronExited=false` cleanup failure did not recur).

Remaining failure (BOTH accounts): `mpv player has no tracks` / `player duration is unknown` /
`player did not become ready` / black screenshot. This is the SEPARATE stream-readiness root cause
(Range-broken / very large DirectPlay source not demuxing), compounded on account 2 by the live server
`502`/network errors. It is NOT the lifecycle race fixed in this round.

## Verification

- `cargo fmt --check`, `cargo check` (default + `mpv-embedded`), `node --check`, `git diff --check`,
  `npm run tauri:build` (package integrity ok) — all passed.
- Release exe: `2026-06-04 15:31:46`, `8,702,976` bytes.

## Next

- The lifecycle race fix is complete and validated; it can be committed/pushed.
- The black/no-tracks result is the Range-broken / large-source stream-readiness issue (next round target),
  and account 2's server was returning 502/network errors during this validation window.
