# 2026-06-08 12:45 - Standalone (independent-window) mpv mode + stdout progress reporter (T2)

## Why

The embedded native mpv child window (`WS_CHILD` via `--wid`) sits above the WebView in z-order, so DOM
controls fight the video for clicks (see `2026-06-07-1930-player-controls-overlay-window.md`). The reference
app HillsLite solves actual playback with a **separate native player process** (`HillsPlayer.exe`, Qt + libmpv)
and tracks progress by parsing an mpv Lua reporter on stdout. This change adds the Tauri/Rust equivalent as a
**parallel** playback mode: launch the bundled `mpv.exe` as its own top-level window with native OSC controls,
which sidesteps the WebView z-order problem entirely, and report progress to Emby from the Rust side.

The embedded `--wid` overlay path is unchanged and stays the default; this is an additive mode. Which mode
becomes the default is left to QA (T5).

## Approach

- `src-tauri/src/mpv/standalone.rs` (new): `StandalonePlayer` launches the **bundled** mpv (`resolve_mpv_exe`)
  as an independent window (`--force-window=yes`, `--osc=yes`, **no** `--wid`), injects the shared reporter via
  `--script=<resolve_reporter_script()>`, and pipes stdout. A reader task decodes each line with the shared
  `parse_reporter_event` (CH-3's decode layer) into `MpvReporterEvent` and maps them onto Emby reporting:
  - `file-loaded` -> first `report_progress` (Emby registers the now-playing session on first progress POST);
  - `time-pos` -> throttled `report_progress` (>=3s) with `PositionTicks`;
  - `pause` / `seek` -> immediate `report_progress`;
  - `end-file` (and the stdout-EOF fallback) -> `report_stopped` exactly once (`AtomicBool` swap), so the server
    marks watched / stores resume.
  - Resume start position comes from `--start=<seconds>` (suppressed when the line is not Range-seekable).
  - Quick wins: `--stop-screensaver=yes` (keep awake) and `--sub-fonts-dir` when a bundled `subfont.ttf` is
    present (font shipping itself is CH-6 / T4).
- `src-tauri/src/commands/player.rs`: `play_standalone` reuses the exact Direct Play / Direct Stream picker
  (`pick_local_media_source` -> `supports_local_decode()`), line selection (`select_playback_line`) and local
  stream proxy as `play`, then launches the standalone window instead of loading the embedded backend. It stops
  the embedded backend first so the same item is not decoded twice. `stop_standalone` stops it and finalizes any
  watch-while-download recording like `stop`. Only the bundled mpv is ever launched (no system/PATH/PotPlayer)
  and only the proxied direct URL is played, so no server-side transcoding is involved.
- Wiring: `mpv/mod.rs` exports `standalone`; `state.rs` holds `AppState.standalone` and stops it on shutdown;
  `lib.rs` registers `play_standalone` / `stop_standalone`.

## Build / run

- `node scripts/check-local-decode-guard.mjs` ok (156 files; local-decode policy intact).
- `cargo check --release --features mpv-embedded` ok (Finished, 2m59s). Fixed the one unused-import warning in
  the new module. (Pre-existing unused re-export `HILLS_MPV_EVENT_PREFIX` in `mpv/mod.rs` is part of CH-3's
  reporter layer and left untouched.)

## To verify (QA / T5)

- Call `play_standalone` for an Emby item: the bundled mpv opens in its own window with OSC controls; no
  WebView overlay z-order/passthrough issues. Emby shows progress advancing and resume taking effect; pausing
  reflects on the server; closing the window / `stop_standalone` marks Stopped at the right position.
- Confirm time-pos reporting is throttled (no per-tick spam) and that an external mpv crash/abrupt close still
  reports Stopped (stdout-EOF fallback).
- Regression: the embedded `--wid` path (`play` / `embed_*`) is unchanged.

## Next

- Frontend (CH-6 / PlayerView) entry point + setting to choose embedded vs standalone mode.
- Optional: IPC control channel for the standalone window so Emby remote-control (session_controller) can drive
  it; today control is via mpv's native OSC/keybindings.
- Align the reporter event interface with CH-6 (T4) scrobble usage.
