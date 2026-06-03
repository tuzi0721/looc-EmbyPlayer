# 2026-06-03 15:38 Real command playback embed hang

## What happened

- Real-account command-only validation reached the real server successfully:
  - Tauri bridge loaded.
  - Server detection succeeded as Emby.
  - Login succeeded.
  - Views/resume/hero/media/series loaded.
  - PlaybackInfo returned `mediaSourceCount: 2` and `playMethod: DirectPlay`.
- The run then timed out after entering the player route.

## Evidence

- `visual-smoke.log` for this run contains:
  - `player embed_attach:start`
  - `player embed_attach:parent-ready`
- It does not contain `player embed_attach:complete`.

## Finding

- The startup blank issue is fixed enough for frontend/login/playback-source setup.
- The current blocker is inside playback attach: lazy native embedded mpv initialization or `wid` binding blocks after the parent window handle is ready.

## Next

- Move native embedded initialization/bind work off the WebView invoke path or add bounded timeout diagnostics so `embed_attach` cannot hang the renderer.
- Rerun command-only validation without screenshots.
