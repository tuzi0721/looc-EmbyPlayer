# Playback line Range failover (2026-06-04 02:53)

## Scope

- Improve real-server playback preparation across multiple server lines.
- Prefer a line that actually supports HTTP Range before handing a stream to mpv.
- Keep server-side transcoding disabled.

## Changes

- `src-tauri/src/commands/player.rs`
  - Added ordered playback line candidates:
    - explicit user-selected line stays explicit and does not auto-switch;
    - automatic playback tries the active line first;
    - then tries other enabled non-down lines by priority/latency.
  - Added per-line playback headers and URL preparation helpers.
  - Added per-line Range probing before mpv load.
  - If a line fails Range probing, playback tries the next candidate instead of immediately showing a fatal error.
  - If a line returns `Range=false`, playback keeps looking for a seekable line before falling back to a non-seekable stream.
  - For MP4/M4V/MOV without Range, each candidate still runs the existing prefix `moov` / `moof` check; non-faststart MP4 is blocked before mpv load.
  - Playback diagnostics now include `rangeSupported`.

## Verification

- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
  - Passed.
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`
  - Passed.
- `npm.cmd run build`
  - Passed.
  - Includes local decode guard: no server transcoding path was enabled.
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
  - Passed.
- `npm.cmd run tauri:build`
  - Passed.
  - Tauri package integrity passed with bundled mpv files.
  - Latest release exe: `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`, size `8,627,200` bytes, last write time `2026/6/4 02:49:35`.

## Real Account Evidence

- Unpinned real command-only run:
  - Server detection won line 2.
  - PlaybackInfo selected `DirectPlay`.
  - Sampled item was real MP4 `34535`.
  - Playback tried line 2 first.
  - Line 2 returned `Range=false`, `content_type=video/mp4`.
  - MP4 prefix probe read 2 MiB and found `mdat=true`, `moov=false`, `moof=false`, `streamable=false`.
  - Playback then tried line 1 instead of stopping immediately.
  - Line 1 Range probe failed, then playback returned the clear Range-broken MP4 error before mpv load.
  - Cleanup had `mpvProcessCount=0`.
- Fixed-item expected clear-block run with item `34535`:
  - Passed with `ok=true`, `failures=[]`.
  - Confirmed route mounted, player error was visible, `backendReachedLoad=false`, `backendCompletedLoad=false`, `cleanupDetachedHost=true`, and `mpvProcessCount=0`.
  - Follow-up process check found no `emby-player` or `mpv`.
  - Temporary credential input file was deleted.

## Known Remaining Issue

- A non-faststart MP4 served without HTTP Range cannot support seek or reliable direct playback without downloading locally or changing the upstream media/line behavior.
- The next product step should make the download-to-local path for this clear-block state more direct and obvious, then return to broader real playback visual checks on a Range-capable item.
