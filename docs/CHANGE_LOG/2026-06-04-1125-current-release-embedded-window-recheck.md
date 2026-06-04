# 2026-06-04 11:25 - Current Release Embedded Window Recheck

## Context

- The user supplied a screenshot showing a standalone black mpv/Hills Lite playback window with the mpv idle prompt.
- No product code changed in this phase.
- This phase rechecked the current packaged release executable instead of relying on the earlier playback pass notes.

## Verification

- Current release exe:
  - `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
  - Size: `8,700,416` bytes
  - Last write: `2026/6/4 11:22:29`
- Real-account Tauri release command-only playback smoke:
  - Fixed real item: `21648`
  - Server detection: `Emby`
  - Winning line: `real-line-1`
  - PlaybackInfo: `DirectPlay`
  - `supportsTranscoding=false`
  - Selected source: MKV H.264/AAC, `1440x1080`
  - Result: `ok=true`, `failures=[]`
  - mpv state became ready: duration, tracks, H.264 video, AAC audio, non-idle playlist.
  - Native playback capture used the app-owned child hwnd: `mode=wid`, `hostKind=native-child`, runtime `tauri`.
  - Top-level playback window guard passed: one visible `Hills Lite` top-level app window, `externalMpv=[]`.
  - Player controls were present; non-Range progress/seek controls stayed disabled instead of pretending to seek.
  - Cleanup detached the embedded host and ended with `mpvProcessCount=0`.

## Cleanup

- Temporary credential input file was removed.
- Temporary real-smoke artifact directory was removed.
- No `real-smoke-frame-*.png` files remained in the app screenshot directory.
- Follow-up process check found no `emby-player.exe` or `mpv.exe`.

## Next

- Commit and push this verification phase.
- Continue the remaining user-visible work, prioritizing stable real visual validation before claiming light-theme/layout fixes complete.
