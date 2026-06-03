# 2026-06-03 22:59 - mpv Screenshot Window Fallback

## Summary
- Added a final `window` screenshot fallback for both bundled mpv IPC playback and libmpv embedded playback.
- Screenshot requests now try `subtitles -> video -> window` when subtitles are requested, and `video -> window` otherwise.
- This targets real embedded `--wid` playback where mpv can reject `screenshot-to-file` in `subtitles`/`video` mode even though playback has a video track and visible output.

## Verification
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`
- `node --check scripts\real-server-visual-smoke.mjs`
- `git diff --check`

## Next
- Rebuild the packaged release and rerun the real-account command-only playback guard.
