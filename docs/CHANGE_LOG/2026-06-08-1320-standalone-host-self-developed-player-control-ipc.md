# 2026-06-08 13:20 - Standalone player host integration: pluggable binary + control IPC (T9c)

## Why

The architecture re-evaluation (after the HillsLite reverse-engineering) chose the "dedicated native
player process + HTML overlay" model — exactly what HillsLite does (`HillsPlayer.exe`, a Qt6/QML+libmpv
process driven by mpv-style argv + a stdout JSON reporter), and the only path not blocked by wry's
windowed (non-composition) WebView2. T9c is the Rust/Tauri **host integration** for that model. It evolves the
T2 `standalone.rs` so it can host our own self-developed player (`player.exe`, tasks T9a/T9b) while still
working today on the bundled mpv, and adds a host-driven control channel.

## Approach

`src-tauri/src/mpv/standalone.rs` (evolved):

- **Pluggable spawn target** `resolve_player_exe()`: prefers `resources/player/player.exe` (also accepts
  `HillsPlayer.exe`), falls back to the bundled `mpv.exe`. Only ever a bundled binary — never
  system/PATH/PotPlayer. So the host upgrades automatically once T9a/T9b ship `player.exe`.
- **Extended argv** in `build_args`: `--input-ipc-server`, `--fullscreen`, `--aid`, `--sid`, `--sub-file`
  added to the existing `--start/--volume/--script/--hwdec/--cache/...`. All mpv-compatible, so they work with
  the fallback mpv and define the contract the custom player must honor.
- **Control IPC**: launches with `--input-ipc-server=<pipe>` (named pipe on Windows, unix socket elsewhere),
  connects a writer (`connect_ipc_writer` -> `spawn_ipc_io`, generic over the connection, with a drain task so
  the pipe never backs up), and exposes `StandalonePlayer::control(StandaloneControl)` for
  pause/resume/stop/seek/setVolume/setAudioTrack/setSubtitleTrack as newline-delimited mpv JSON commands.
  Control degrades gracefully to the player's native OSC if the pipe never connects.
- `stop()` now asks the player to `quit` over IPC first, then force-kills, then reports `Stopped`.
- Stdout reporter -> Emby mapping (file-loaded->start, throttled time-pos->progress, pause/seek->progress,
  end-file/EOF->stopped-once) is unchanged from T2.
- `commands/player.rs`: new `standalone_control` command (action + optional positionMs/volume/trackId);
  `play_standalone` passes the new request fields (defaults). `lib.rs` registers it. `mpv/mod.rs` exports
  `StandaloneControl`.

## Build / verify

- `node scripts/check-local-decode-guard.mjs` ok (156 files; no-transcode policy intact).
- `cargo check --release --features mpv-embedded` ok (Finished, ~25s incremental). No linter errors.
- Added unit tests for control->IPC mapping and `secs_to_ms`/play-method sanitization.

## Dependencies / follow-ups (blocked on T9a/T9b)

- **Packaging** of the actual `player.exe` + Qt runtime DLLs + libmpv + shaders/fonts into
  `src-tauri/resources/player` waits on T9a/T9b producing the binary; today the host transparently falls back
  to bundled mpv, which exercises the entire spawn/argv/stdout/IPC path end-to-end.
- The custom player must honor: mpv-style argv (above), `HILLS_MPV_EVENT:` stdout reporter, and
  `--input-ipc-server` JSON command IPC. This is the contract this host integration assumes.
- Frontend entry/overlay wiring + mode toggle with CH-6; QA (T5) runtime verification of progress/resume/
  control IPC.
