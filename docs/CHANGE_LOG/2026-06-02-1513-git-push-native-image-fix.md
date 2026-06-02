# 2026-06-02 15:13 Git Push Native Image Fix

## Scope
- Committed the native screenshot guard, history/favorites image candidate ordering, and matching state log as `aea1cf6 Fix native smoke capture and card images`.
- Pushed `aea1cf6` to `origin/main`, updating the remote from `9e74a45` to `aea1cf6`.

## Verification
- `git diff --cached --check`
- Staged sensitive literal scan for the test username, password, known line hostnames, real smoke environment keys, Emby token names, and API key names
- `git push origin main`

## Result
- The normal sandbox push failed with `SEC_E_NO_CREDENTIALS`.
- Retrying the same push through the local Git credential context succeeded.
- No credentials, tokens, complete server URLs, or playback URLs were recorded in this log or the committed diff.

## Next
- Re-run the real-server multi-size visual smoke after explicit network approval, using the existing delayed playback screenshot rule: wait for playback visual readiness, then wait another 5 seconds before capture.
