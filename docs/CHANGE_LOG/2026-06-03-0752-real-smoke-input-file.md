# 2026-06-03 07:52 real smoke input file

## Context

- The previous real-server visual-smoke invocation used an interactive secure PowerShell prompt and left a stale process.
- Real visual smoke still needs to run with the provided test account, but credentials must not appear in command lines, committed files, or logs.

## Change

- `scripts/real-server-visual-smoke.mjs` now supports `HILLS_REAL_INPUT_FILE`.
- When present, the script reads the same four-line payload as stdin:
  - line 1 base URL
  - line 2 base URL
  - username
  - password
- The file is deleted immediately after reading unless `HILLS_REAL_INPUT_FILE_KEEP=1` is explicitly set.
- Existing env var and stdin input modes remain supported.

## Verification

- `node --check scripts\real-server-visual-smoke.mjs`

## Next

- Create a temporary input file outside the repo using the real test credentials.
- Run Tauri release real visual smoke with `HILLS_REAL_INPUT_FILE` pointing to that temp file.
- Confirm the temp input file is removed after the run starts.
