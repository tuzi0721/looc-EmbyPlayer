# 2026-06-04 03:44 - Real smoke embedded show timeout

## Result

- Real-account Tauri release smoke was rerun from a clean native launch path after the startup/player context guard was pushed.
- Login and server detection succeeded. The smoke identified line 2 as the healthy Emby line, loaded `/home`, and found real remote media data.
- PlaybackInfo for selected item `34503` stayed local-decode only: DirectPlay, `mp4`, `hevc/aac`, `1920x1080`, `supportsTranscoding=false`.

## Failure

- The run failed in the embedded mpv startup path, not in login or media lookup.
- User-visible error: `embedded mpv host show timed out`.
- Visual log reached `embed_attach:complete`, `embed_visible:show`, `play:mpv-load-start`, and `get_state:start`.
- Visual log did not reach `embed_visible:complete`, `play:mpv-load-complete`, or `get_state:complete`.
- Smoke failures included `player get_state timed out`, `backend mpv load did not complete`, `mpv video state did not become ready`, and failed pause/resume/seek assertions.
- No external mpv window was observed, and the follow-up process count for mpv was `0`.

## Next

- Add bounded native-side logging/timeout behavior around embedded host show/hide/detach and mpv snapshot.
- Fix the blocking path before claiming playback is visually passed.
