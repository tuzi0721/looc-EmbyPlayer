# 2026-06-04 00:35 - Range Preflight Lavf Seekable

## Summary
- Removed the invalid `http-seekable` property writes from both mpv backends.
- When the real Range preflight fails, embedded libmpv now loads the local proxy URL with per-file `loadfile` options: `demuxer-lavf-o=seekable=0`.
- The IPC backend now sends the same per-file option through JSON IPC `loadfile` with index `-1` and an options object.
- This keeps the source in DirectPlay/DirectStream local-decode mode; it does not request server transcoding.

## Verification
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `node --check scripts\real-server-visual-smoke.mjs`
- `git diff --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`
- `npm.cmd run build`

## Next
- Rebuild the packaged Tauri release.
- Rerun the real-account command-only playback guard and require mpv to reach real loaded video state, not just visible controls.
