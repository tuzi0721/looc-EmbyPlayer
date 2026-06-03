# 2026-06-04 06:48 - Range seek state and detail click target

## What changed

- Added structured playback capability fields from the native `play` result:
  - `rangeSupported`
  - `startSuppressedNonSeekable`
- Kept non-Range remote playback on local decode, but made the player UI treat it as non-seekable:
  - progress slider is disabled when the active remote line is not Range-seekable
  - seek back / seek forward buttons are disabled with a clear title
  - seek handlers return early instead of sending no-op seek commands
- Tightened detail hero pointer handling so the visual hero background no longer captures clicks above the play button.
- Updated the real-server smoke command-only assertion so a confirmed non-Range stream is not failed for 30 second remote seek assertions.

## Real validation notes

- Full real-account Tauri release smoke was rerun before this fix and still failed. It logged real login/server detection success, DirectPlay/no-transcode PlaybackInfo success, and selected real movie item `21648`, but the player route remained black with no exposed playback state in the full flow.
- A fixed-item command-only real run for item `21648` on the then-current release showed the media itself can play:
  - DirectPlay and `supportsTranscoding=false`
  - native embedded frame pixel evidence passed
  - DOM controls were visible
  - cleanup detached the embedded host and left `mpvProcessCount=0`
  - forward/back seek assertions failed because both tested lines reported non-Range behavior for this MKV
- The retained real-smoke artifact directory was deleted after inspection because it could contain local config or tokens.

## Verification

- `node --check scripts\real-server-visual-smoke.mjs`
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- `npm.cmd run build`
- `git diff --check`

## Next

- Rebuild the packaged Tauri release.
- Rerun fixed-item real command-only playback for item `21648` to confirm non-Range seek is now represented as disabled/skipped instead of a failed command.
- Rerun full real smoke to see whether the remaining black-screen issue is still route cleanup/start-position contamination or a separate full-flow regression.
