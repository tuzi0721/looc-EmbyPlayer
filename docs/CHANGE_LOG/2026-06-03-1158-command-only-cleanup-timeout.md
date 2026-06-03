# 2026-06-03 11:58 - Command-only cleanup timeout

## Evidence

- Ran real-account command-only smoke against the `10:57` Tauri release.
- Setup reached the real server and loaded account media: `viewCount=5`, `resumeCount=3`, `heroCount=36`, `mediaSourceCount=2`.
- The temp credential input file was deleted after the script read it.
- App visual-smoke log showed the backend playback chain reached:
  - `embed_attach:complete`
  - `play:start`
  - `play:playback-info media_sources=2`
  - `play:mpv-load-start`
  - `play:mpv-load-complete`
  - `play:return`
- App visual-smoke log also showed repeated `get_state:complete`.

## Failure

- The command-only script still ended with `Runtime.evaluate timeout`.
- The timeout happened after `command-only-start`, while the page-side verification expression was still running.
- The likely bad spot is command-only cleanup waiting on stop/detach inside a single long `Runtime.evaluate`.
- A process check after the run found no matching app/mpv/smoke process left.

## Result

This is progress but not a pass. The latest exe does reach backend play and mpv load against the real server, but the command-only verifier must bound cleanup so it can report the final state instead of timing out.
