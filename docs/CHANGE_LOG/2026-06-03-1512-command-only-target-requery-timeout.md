# 2026-06-03 15:12 Command-only target requery timeout

## What happened

- Ran real-account command-only validation against `src-tauri\target\release\emby-player.exe`.
- The script launched Tauri release, reached `cdp-targets-ready` with `count:1`, then failed before setup/login with `CDP target timeout`.
- The temporary credential input file was deleted.

## Finding

- This failure is in the verifier target-selection path, not in Emby login or playback.
- The verifier fetched CDP targets once, then called `getPageTarget()`, which queried targets again and could time out if the port disappeared or if the first target should have been reused.

## Next

- Rework `getPageTarget()` to evaluate the initial target list first, log the selected/last page URL, and only retry with short follow-up polls when the initial target is `about:blank`.
- Rerun command-only validation without screenshots.
