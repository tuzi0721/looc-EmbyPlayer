# 2026-06-02 08:36 Episode image fallback and native mpv evidence

## Scope
- Kept only the accepted media image fallback change in `src/utils/mediaImages.ts`.
- Rolled back the attempted Electron native mpv `--wid` embedding experiments because the user-visible window stayed black.

## Evidence
- Local playback smoke showed direct-play/decode, seek, fullscreen, resize, and cleanup behavior working in the runtime path.
- mpv internal screenshots contained real frames, but the actual captured app window stayed black (`screenPixelsOk=false`, `brightRatio=0`, `colorfulRatio=0`).
- Tested native child-window, owned-popup, z-order, OpenGL, `hwdec=auto-copy`, and Electron GPU variants; none produced a reliable user-visible embedded video surface.

## Result
- Native Electron mpv embedding is not accepted as a fix and is not the default visible playback path.
- Episode image lookup now falls back from the episode to parent/series Backdrop, Thumb, Primary, and Logo candidates where the server provides those ids/tags.
- No credentials, tokens, full server URLs, or playback URLs were written to this log.

## Next
- Re-run build and visual smoke for the retained image fallback.
- Continue with real-account, real-server testing across multiple window sizes/aspect ratios before claiming UI or playback completion.
