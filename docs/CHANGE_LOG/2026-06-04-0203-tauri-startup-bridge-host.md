# 2026-06-04 02:03 - Tauri Startup Bridge Host

## Summary
- Hardened the Tauri runtime bridge detection so release pages loaded from `tauri.localhost` cannot silently fall back to the web-preview mock backend.
- Rebuilt the Tauri release executable and verified startup with the real account command-only personal-media guard.

## Changed
- `src/platform/index.ts` now treats `window.__TAURI_IPC__`, `http://tauri.localhost/...`, and `tauri:` pages as Tauri runtime contexts.
- This keeps `window.hillsLite` installed for release startup even if the older global-object check is not enough at bridge install time.

## Verification
- `npm.cmd run build`
- `npm.cmd run tauri:build`
- `git diff --check`
- Real-account command-only startup/personal guard:
  - `HILLS_REAL_APP_MODE=tauri-release`
  - `HILLS_REAL_PERSONAL_ONLY=1`
  - Result: `ok=true`, `failures=[]`.
  - Bridge/router after reload: `hasBridge=true`, `hasRouter=true`, `readyState=complete`, `route=/home`.
  - Real backend evidence: 2 accounts, 2 servers, 72 all-account media records, sourced History/Aggregate cards, sourced Aggregate search, and click-through preserving `server/account` query.
- Follow-up process check found no `emby-player` or `mpv` process.
- Temporary account input file was deleted by the smoke script.

## Release Artifact
- `A:\vsc\emby-player\src-tauri\target\release\emby-player.exe`
- Size: `8,620,032` bytes.
- Last write: `2026/6/4 02:01:11`.

## Next
- Commit and push this phase, then continue the next visible playback/layout issue.
