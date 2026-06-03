# 2026-06-03 22:53 - Real Playback Detach Pass, Capture Fail

## Summary
- Reran the real-account command-only playback guard against the rebuilt release.
- The product cleanup bug from the previous run improved: route-away reached `embed_detach:start` and `embed_detach:complete`, and `mpvProcessCount` was `0`.
- Real login, PlaybackInfo, local decode, player state, visible bottom controls, pause/resume, seek forward, and seek backward all remained functional.
- The run still failed because the verifier's frame evidence path was not robust enough: mpv `screenshot-to-file` failed, then the native PowerShell capture hung until manually stopped.

## Evidence
- Result: `ok: false`.
- Product cleanup evidence:
  - `cleanupDetachedHost: true`
  - `mpvProcessCount: 0`
  - visual smoke log contained `embed_detach:start` and `embed_detach:complete`
- Remaining failures:
  - `mpv frame screenshot is missing or visually blank: mpv error: mpv error: error running command`
  - `native playback capture failed: powershell failed: 4294967295`
- Follow-up cleanup check: temporary real-credential input file was deleted; no residual `emby-player.exe` or `mpv.exe` remained.

## Next
- Harden the native capture helper with a hard timeout/kill path so visual evidence cannot hang validation.
- Rerun the real playback guard after the verifier fix.
