# 2026-06-02 12:40 Real Detail Playback Smoke Pass

## Scope

- Tightened the real-server visual smoke so playback opens by clicking the real detail-page play button instead of jumping directly to `/player/:id`.
- Fixed mpv seek-back controls to use runtime relative seek, avoiding stale frontend position snapshots.
- Adjusted the visible-pixel smoke threshold so dark real video frames are not misclassified as blank when brightness is sufficient.

## Result

- Real account login passed on the detected Emby line.
- The real detail play button was visible, enabled, clicked, and opened the player route with the player component mounted.
- The selected real source remained DirectPlay, MKV, H.264/AAC, with transcoding disabled.
- Bundled mpv exposed duration, position, tracks, codec, D3D11 video params, and captured a visible real video frame.
- Seek-back moved playback from 15s to 5s.
- Fullscreen, 1366x768, 960x600, and 760x430 player resize checks passed.
- Runtime cleanup passed; Electron exited and no playback child process remained.

## Verification

- `node --check scripts\real-server-visual-smoke.mjs`
- `npm.cmd run build`
- `node scripts\smoke-electron-embedded-local.mjs`
- `node scripts\real-server-visual-smoke.mjs` with real credentials supplied through environment variables and output desensitized.

## Notes

- The earlier "player screenshot is visually black/blank" failure was a smoke-threshold false negative on a dark real frame; manual inspection of the process-contained native capture showed a visible video frame.
- Credentials, tokens, full server URLs, and playback URLs were not written to this log.
