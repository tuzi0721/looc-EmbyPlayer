# 2026-06-02 14:52 Real Visual Smoke Pass

## Scope
- Reran the real-server visual smoke with hidden interactive input after adding output redaction.
- Verified real Emby detection, login, media library loading, home/detail/series detail responsive layouts, personal routes, search, real detail play entry, player controls, fullscreen, resizing, seek-back, and runtime cleanup.
- Preserved the local-decode-only contract: the selected real playback source used `DirectPlay`, reported `supportsTranscoding: false`, and exposed mpv playback state.

## Verification
- `node scripts\real-server-visual-smoke.mjs`

## Result
- Final result: `ok: true`, `failures: []`.
- Home layout checked at 1920x1080, 1366x768, 1024x768, 960x600, and 760x430.
- Detail and Series detail layouts checked at the same five sizes.
- Real Series detail playback opened a concrete episode route.
- Main player opened from a real detail page, reached visual-ready state, waited an additional 5 seconds, then captured a nonblank player screenshot.
- Seek-back moved playback from about 15000 ms to about 5000 ms.
- Player controls were visible in fullscreen and at 1366x768, 960x600, and 760x430.
- Runtime cleanup exited Electron and left no mpv/electron child process behind.

## Notes
- No credentials, tokens, complete server URLs, or playback URLs are recorded in this log.
- The smoke output was redacted before this run.
