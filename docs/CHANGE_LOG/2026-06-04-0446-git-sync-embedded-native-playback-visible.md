# 2026-06-04 04:46 - Git sync embedded native playback visibility

## Result

- Committed and pushed the embedded native playback visibility phase.
- Commit: `799716a Fix embedded native playback visibility`
- Remote: `main` updated from `674c7a0` to `799716a`.

## Included

- Windows native child host thread/message loop for embedded mpv.
- Native child z-order and rect sync so the visible video region is not hidden behind WebView and does not cover controls.
- Safer PlayerView startup when embedded host setup fails.
- Real smoke script tightened to require app-owned native-window pixel evidence.
- Failure and success phase logs for the real-account release smoke evidence.

## Next

- Continue the next unresolved user-visible issue from the project list.
