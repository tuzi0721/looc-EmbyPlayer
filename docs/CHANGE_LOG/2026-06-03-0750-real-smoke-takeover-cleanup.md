# 2026-06-03 07:50 real smoke takeover cleanup

## Context

- Continued the active real embedded player / real-server visual-smoke goal.
- Re-checked the current worktree instead of trusting the previous turn summary.
- Found one stale real visual-smoke PowerShell process from the secure-stdin attempt:
  - PID: 29360
  - It was still waiting/running under the previous `Read-Host -AsSecureString` invocation.
  - The command line did not expose the test account password in process arguments.
- No `emby-player.exe`, mpv, or child node process from that stale run was found.
- The normal dev server node processes on port 1420 were left untouched.

## Evidence

- `git status --short` still shows the large in-progress worktree plus the required phase logs.
- `%LOCALAPPDATA%\EmbyPlayer\visual-smoke.log` was absent after the stale secure-stdin run, so that run did not reach the app diagnostic logger.
- The latest valid preserved real-smoke artifact directory remains:
  - `C:\Users\Sakur\AppData\Local\Temp\hills-lite-real-visual-1780442304168`
- Its app-local diagnostic log only contains the early CDP/data-dir line:
  - `cdp port 9445 configured; webview data dir: ...`
- Earlier evidence still points to player readiness/state timeout rather than a successful visual playback pass.

## Actions

- Terminated the stale PowerShell process PID 29360 with `Stop-Process -Id 29360 -Force`.
- Avoided touching unrelated dev-server/Codex node processes.
- Confirmed that the secure-stdin smoke invocation path is too brittle for the next real run.

## Next

- Replace the real-smoke credential handoff with a non-interactive temp stdin file invocation that deletes the temp file immediately after use.
- Rerun the real visual smoke against `src-tauri\target\release\emby-player.exe`.
- If playback still fails, use the new player stage diagnostics to fix the exact `play` / `get_state` / embedded mpv blocking point.
