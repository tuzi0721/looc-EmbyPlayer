# 2026-06-04 07:08 - Fixed-item embedded playback pass

## What changed

- Fixed the real-server smoke input precedence so `HILLS_REAL_INPUT_FILE` wins over stale `HILLS_REAL_*` environment values.
- Fixed fixed-item selection so a requested item id is used even when it is not present in the sampled home/media candidate lists.
- Added a non-sensitive `setup-selection` stage to show the requested item id and selected item id.
- Disabled player progress/seek controls when a playback error is visible, so a clear pre-playback block no longer leaves a fake usable control strip.

## Verification

- `node --check scripts\real-server-visual-smoke.mjs`
- `npm.cmd run build`
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- `git diff --check`
- `npm.cmd run tauri:build`
- Real-account Tauri release command-only smoke with fixed item `21648`:
  - `setup-selection` selected `21648`
  - `ok=true`, `failures=[]`
  - DirectPlay and `supportsTranscoding=false`
  - embedded native child produced nonblank frame evidence
  - no external top-level mpv window
  - `mpvProcessCount=0` after cleanup
  - non-Range remote controls were represented as disabled in DOM (`progressInput`, seek back, seek forward)

## Release artifact

- `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Size: `8,671,232` bytes
- Last write time: `2026-06-04 07:07:28`

## Next

- Commit and push this phase.
- Continue with full real-account smoke. Remaining likely failures are still full-flow playback from detail/resume, history/aggregate image loading, selected-item search, and any layout regressions the full run reports.
