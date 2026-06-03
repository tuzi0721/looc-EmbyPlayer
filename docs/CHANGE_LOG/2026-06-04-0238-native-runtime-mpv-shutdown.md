# Native runtime playback and mpv shutdown guard (2026-06-04 02:38)

## Scope

- Unified Tauri/native runtime detection for playback-facing UI.
- Added a Windows process-tree kill fallback for bundled mpv shutdown.
- Rebuilt the packaged Tauri release exe.

## Changes

- `src/platform/index.ts`
  - Exported `hasTauriRuntime()` so all runtime checks use the same Tauri detection.
  - Added `hasNativeRuntime()` for Electron/Tauri native capability checks.
  - Tauri detection includes `window.__TAURI_IPC__`, `tauri.localhost`, and `tauri:`.
- `src/views/PlayerView.vue`
  - Replaced the stale local Tauri check with `hasNativeRuntime()`.
  - Release playback pages now choose embedded mpv instead of the Web/HTML-video fallback.
- `src/views/DetailView.vue`
  - Uses the shared native-runtime check for desktop download availability.
- `src/views/SettingsView.vue`
  - Uses shared Tauri/native runtime checks for backup/runtime capability detection.
- `src-tauri/src/mpv/ipc.rs`
  - If normal mpv shutdown times out, Windows now falls back to `taskkill /PID <pid> /T /F` and then waits again.
  - Shutdown warnings now include the mpv pid for diagnosis.
- `src-tauri/src/state.rs`
  - Scoped `MpvBackendKind` import to the `mpv-embedded` feature to keep `cargo check --all-targets` clean.

## Verification

- `npm.cmd run build`
  - Passed.
  - Includes local decode guard: server transcoding remains disabled.
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
  - Passed cleanly after the conditional import fix.
- `npm.cmd run tauri:build`
  - Passed.
  - Package integrity passed with 7 bundled mpv files copied to `src-tauri\target\release\resources\mpv`.
  - Latest release exe: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`, size `8,622,592` bytes, last write time `2026/6/4 02:36:15`.

## Real Account Evidence

- First release command-only run after the runtime fix:
  - Real server detected as Emby.
  - Login succeeded.
  - PlaybackInfo selected `DirectPlay`.
  - Selected media source had `supportsTranscoding=false`.
  - Embedded host attached and backend reached `play:mpv-load-complete`.
  - Real mpv state became ready with duration, video track, video/audio codecs, and visible DOM controls.
  - Failure remained: seek forward/back did not satisfy the guard and `mpvProcessCount=1` after cleanup.
- After adding the mpv shutdown fallback and rebuilding:
  - Real login and `DirectPlay` PlaybackInfo still succeeded.
  - Cleanup left `mpvProcessCount=0`.
  - This rerun hit a Range probe failure before `play:mpv-load-start`, so it does not fully prove active-playback force-kill under a loaded mpv session.
  - Follow-up process check found no `emby-player` or `mpv` residue.
  - Temporary credential input file was deleted.

## Known Remaining Issue

- Real playback can still be blocked before mpv load by transient or line-specific Range probe failure.
- The sampled real item can also fail the seek guard when the upstream stream is non-seekable or Range support is unreliable.
- Next stage should target Range/seek behavior directly instead of UI color work.
