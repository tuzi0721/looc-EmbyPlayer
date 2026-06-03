# 2026-06-03 07:31 - Tauri diagnostic release build

## What changed
- Rebuilt the Tauri `mpv-embedded` release executable after adding visual-smoke-only backend stage diagnostics for player startup and `get_state`.
- Confirmed the refreshed release artifact is `src-tauri\target\release\emby-player.exe`.

## Verification
- `cargo build --manifest-path src-tauri\Cargo.toml --release --features mpv-embedded --offline`
  - Passed in 3m 53s.
- `git diff --check`
  - No whitespace errors; only existing LF/CRLF warnings were reported.
- Release artifact check:
  - `emby-player.exe`: 2026/6/3 07:30:56, 8,128,512 bytes.
  - `libmpv-2.dll` and `d3dcompiler_43.dll` are present beside the exe.

## Next
- Run the real-server visual smoke against this exact release exe with the real test account.
- Inspect `visual-smoke.log` and captured screenshots to find whether playback stalls inside `play`, `get_state`, or frontend bridge handling.
