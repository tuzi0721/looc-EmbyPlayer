# 2026-06-02 15:18 Real Visual Smoke Manual Reject

## Scope
- Re-ran the real-server multi-size visual smoke with kept screenshot artifacts.
- Used hidden interactive input for both server lines and the test account so credentials and full server URLs were not written to files, logs, or the command line.

## Verification
- `node scripts\real-server-visual-smoke.mjs`
- Manual screenshot review of retained artifacts under `C:\Users\Sakur\AppData\Local\Temp\hills-lite-real-visual-1780384565792\screenshots`

## Result
- Automated smoke returned `ok: true` and `failures: []`.
- Real Emby detection/login succeeded, with 5 library views and 2 media sources.
- Playback source stayed on `DirectPlay`; the selected source reported `supportsTranscoding: false`.
- The player exposed mpv state, 4 tracks, D3D11 video params, and no HTML video error.
- Player visual readiness was reached after about 1750 ms, then the smoke waited the required extra 5 seconds before screenshot capture.
- Seek back moved from about 15000 ms to about 5000 ms.
- Fullscreen, player resize checks, and runtime cleanup passed; remaining Electron/mpv child process count was 0.
- No `player-native-host.png` was generated, so this run did not keep misleading desktop/native-host screenshot evidence.

## Manual Reject
- `detail-960x600.png` shows a long detail-page title clipped at the top in a real account screenshot.
- This means the run cannot be treated as a complete visual pass even though the automated JSON passed.

## Next
- Tighten detail-page responsive title sizing/positioning for compact desktop windows.
- Add a visual/script assertion so long titles in compact detail pages cannot be clipped silently.
