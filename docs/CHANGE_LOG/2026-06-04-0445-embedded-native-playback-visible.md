# 2026-06-04 04:45 - Embedded native playback visible

## Result

- Reworked the Windows mpv native child host so the child window is created and controlled from a dedicated Win32 host thread with its own message pump.
- `embed_visible` no longer blocks in the real-account release smoke: the visual log reached `embed_visible:complete` before playback started.
- Moved the app-owned native child above the WebView layer and synced its rectangle around the visible top/bottom controls so the video region is visible without covering the progress bar or playback buttons.
- Tightened `PlayerView` startup so a failed embedded host setup stops before launching playback instead of starting hidden mpv playback behind an error.
- Tightened `scripts/real-server-visual-smoke.mjs` so Tauri release command smoke requires app-owned native-window pixel evidence, not just an mpv internal screenshot.

## Verification

- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- `npm.cmd run build`
- `node --check scripts\real-server-visual-smoke.mjs`
- `npm.cmd run tauri:build`
- Tauri package integrity passed with 7 bundled mpv files.
- Real-account Tauri release command smoke passed with no failures:
  - server detection/login/media loading succeeded on a healthy Emby line.
  - PlaybackInfo remained local-decode only: `DirectPlay`, `supportsTranscoding=false`.
  - `embed_attach:complete`, `embed_visible:complete`, `play:mpv-load-complete`, and repeated `get_state:complete` were observed.
  - Native app-owned playback region evidence was captured from the child hwnd: `1280x614`, content aspect `1.773`, `pixelOk=true`, source `native-window`, used app-owned handle.
  - DOM controls were visible, including progress, seek back, play toggle, seek forward, and fullscreen.
  - Pause, resume, seek forward, and seek backward assertions passed.
  - No external mpv top-level window was observed.
  - Cleanup returned to `/home`, detached the embedded host, and `mpvProcessCount=0`.

## Release exe

- `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Size: `8,668,160` bytes
- Last write time: `2026/6/4 04:42:40`

## Next

- Commit and push this playback visibility phase.
- Continue with the next unresolved product issue from the user's list, using real-account validation when the issue touches server data or playback.
