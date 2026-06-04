# 2026-06-04 15:20 - Embedded mpv host/IPC lifecycle race diagnosis

## Scope

- Diagnostic round only. No product code changed.
- Goal: explain the full-flow black screen + `mpv ipc write failed: pipe is being closed` that keeps
  recurring, and why command-only smoke passes while full-flow smoke fails.

## Active playback architecture (release)

- Release builds with `--features mpv-embedded`, but `mpv/manager.rs::build_slot` deliberately selects the
  **IPC backend** (`MpvIpcBackend`) for BOTH `Ipc` and `Embedded` modes. `embedded.rs` (libmpv) is compiled
  but `prefer_embedded=false`, so it is NOT used. The real path is: spawn bundled `mpv.exe` with
  `--wid=<hwnd>` rendering into a native `WS_CHILD` window created by `mpv/window_host.rs`.
- Frontend lifecycle (`PlayerView.vue`):
  - `onMounted`: `setupEmbeddedVideoHost()` -> `embedAttach()` -> `embedSetVisible(true)` -> `startCurrentPlayback()` -> `player.play()` -> `startPolling()` (getState every 1.5s).
  - `onBeforeUnmount`: `player.stop()` -> `teardownEmbeddedVideoHost()` -> `embedDetach()`.

## Root cause: no serialization + destructive re-attach

1. `MpvIpcBackend::bind_embedded()` is UNCONDITIONALLY destructive: every call drops `cmd_tx`,
   `start_kill()`s the current mpv child, destroys the existing host window, then creates a brand-new
   host thread/window. It is invoked on every `embed_attach`, i.e. every PlayerView mount.
2. There is NO async lock serializing `embed_attach` (`bind_embedded`), `play`/`ensure_started`
   (spawns mpv with `--wid`), and `embed_detach`/`shutdown`. They take independent short-lived locks on
   `inner` and `host`. So these can interleave.
3. Full-flow navigation (Detail -> Player, route param changes, the historical series-detail probe, or any
   re-mount) produces overlapping `attach`/`play`/`detach`. When a second `bind_embedded` (or a detach from
   an unmount) runs while a `play` is mid-load, it `start_kill`s the mpv child that `play` just spawned ->
   `run_io` writer's `write_all` fails -> logged `mpv ipc write failed: pipe is being closed`, and the
   in-flight `Load`/`snapshot` commands fail -> black player, no state.
4. Stale `--wid`: `ensure_started` reads `wid` from the current host and spawns mpv against it. If the host
   window is destroyed by a concurrent re-attach/detach right after, mpv renders into a dead HWND -> black.
5. Tight host timeouts under contention: `HOST_READY_TIMEOUT=4s`, host command timeout `1.2s`,
   `embed_set_visible(true)` `4s`. During a busy full-flow these can trip -> `embedded mpv host show timed out`
   (the exact `03:44` failure).

This precisely matches the observed split: command-only smoke = one mount, one attach, one play, no
navigation -> passes; full-flow smoke = navigation/re-mount/probe -> destructive re-attach races the
in-flight play -> black + pipe closed + show timeout.

## Proposed fix direction (NOT yet implemented)

1. Add a single async lifecycle mutex (e.g. `tokio::sync::Mutex`) in the manager/IPC backend that serializes
   `bind_embedded`, the mpv spawn inside `ensure_started`/play, and `detach_embedded`.
2. Make `bind_embedded` idempotent: if a live host for the same parent HWND already exists, reuse it and DO
   NOT kill the running mpv child. Only tear down when the parent window actually changed.
3. Never destroy the host window while its mpv child is still alive; on teardown always stop/kill mpv first,
   then destroy host (detach already does this order; bind's re-attach path violates it).
4. Single-flight the player route: ensure only one PlayerView is mounted and await the previous teardown
   before a new attach; keep the series-detail playback probe out of the production path.
5. Surface "host attach/show failed" distinctly from "media not ready" so failures are diagnosable instead
   of a silent black frame.

## Verification

- Read: `mpv/ipc.rs`, `mpv/window_host.rs`, `mpv/manager.rs`, `mpv/backend.rs`,
  `commands/player.rs` (`play`, `load_ready_playback_line`, `wait_for_loaded_mpv_state`, `get_state`,
  `embed_attach`/`embed_set_visible`/`embed_detach`), `views/PlayerView.vue` (mount/unmount, setup/teardown),
  `stores/player.ts` (`play`, polling).
- No build/test run this round (diagnosis only).

## Next

- Decide via 寸止 whether to implement the fix (start with items 1-3: lifecycle mutex + idempotent
  re-attach + host/mpv teardown ordering), then build and run real-account full smoke.
