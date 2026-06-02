# 2026-06-02 10:55 Real-server visual failures

## Scope
- Ran the real-account, real-server visual smoke after refreshing Electron unpacked output.
- Manually inspected the retained real-server screenshots for the failed areas.
- No credentials, tokens, full server URLs, playback URLs, or local screenshot artifact paths are recorded here.

## Result
- Line 1 detected as Emby, authenticated, and loaded 5 library views.
- The selected real item had real artwork and a direct-play PlaybackSource with no transcoding support selected.
- Home and detail pages rendered real server images; detail uses the fullscreen shell without the main app chrome.
- Runtime cleanup passed and did not leave tracked playback/Electron child processes alive.

## Failures
- The selected real source was MKV/H264/AAC. Electron HTML video rejected it with media error code 4, so playback had no decoded dimensions, unknown duration, blank/failed visible video, and seek-back could not move.
- Player controls were missing in resize checks after the playback error state hid controls before the script rewoke them.
- Home at 760x430 still measured a hero aspect around 3.08, outside the fixed-ratio range expected by the smoke.
- Search did not return the selected real item by name during this smoke run.

## Next
- Inspect real PlaybackInfo media-source candidates and prefer a direct-play/direct-stream HTML-compatible source when one exists.
- If no compatible source exists, Electron needs a reliable in-app mpv-backed path for MKV rather than pretending HTML video can cover it.
- Tighten the compact home hero ratio and rerun real-server multi-size visual smoke.
