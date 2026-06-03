# 2026-06-03 10:02 - Tauri real smoke player evaluate timeout

## Run

- Target exe: `src-tauri\target\release\emby-player.exe`
- Real smoke log: `C:\Users\Sakur\AppData\Local\Temp\hills-real-smoke-output-bf03805036e62341.log`
- Artifacts: `C:\Users\Sakur\AppData\Local\Temp\hills-lite-real-visual-1780448899865`
- Temp credential input file was deleted after script read it.

## Evidence

- Real login/setup succeeded: library views `5`, resume items `3`, hero candidates `36`, media source count `2`.
- Home, detail, and series-detail screenshots completed at five window sizes: `1920x1080`, `1366x768`, `1024x768`, `960x600`, `760x430`.
- Series detail play probe succeeded in opening `/player/34758?start=59002&from=34743`.
- The main player smoke then failed at `player-open-from-detail-start` with `Runtime.evaluate timeout`, before a player screenshot was captured.
- App visual diagnostics only showed repeated `get_state:error` entries and no `play:start`, meaning the player page had not reached the backend `play` command in this run.
- Post-run process check returned no matching `emby-player.exe` / `mpv.exe` residual processes.

## Result

Real-account visual smoke is still failing and must not be considered passed. Next step is to instrument/fix the Tauri embedded attach/startup path so `PlayerView` cannot stall before `startCurrentPlayback()`.
