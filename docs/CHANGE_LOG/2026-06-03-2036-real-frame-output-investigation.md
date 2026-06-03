# 2026-06-03 20:36 - Real frame output investigation

## Change
- Strengthened command-only real playback verification to require a real mpv frame screenshot and pixel evidence, not just backend state movement.
- Switched the user-facing embedded mode to the bundled `mpv.exe` IPC path with `--wid`, so playback still renders in the native child window while avoiding the current libmpv video-output path that produced audio/progress without `video-reconfig`.
- Changed `embed_attach` to bind the native child window directly in the command path instead of creating the HWND on a short-lived blocking worker thread.

## Verification
- `node --check scripts\real-server-visual-smoke.mjs`
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## Real Findings
- The previous real-account command pass was insufficient: it proved DirectPlay, attach/load, pause/resume/seek, and visible DOM controls, but did not prove that a video frame was actually decoded and rendered.
- After adding frame evidence, the libmpv embedded path failed real validation with `mpv error: Raw(-12)`, no `video-params`, no `video-out-params`, and `videoReconfigCount=0`.
- The bundled `mpv.exe --wid` IPC direction then exposed a separate HWND lifecycle issue: `SetWindowPos: invalid window handle`, consistent with the native child window being created on a short-lived worker thread.

## Next
- Rebuild the release exe with the HWND attach-thread fix and rerun real-account frame validation. This phase is not considered user-visible complete until the real frame evidence passes.
