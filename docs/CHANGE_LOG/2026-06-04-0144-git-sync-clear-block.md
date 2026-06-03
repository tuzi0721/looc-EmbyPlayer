# 2026-06-04 01:44 - Git Sync Clear Block

## Summary
- Committed and pushed the Range-broken playback clear-block phase.
- Commit pushed to `main`: `ae00739 Fix range-broken playback clear block`.

## Included
- Range-broken MP4/M4V/MOV prefix metadata guard before mpv load.
- Clear pre-mpv error when Range probe fails.
- Real smoke fixed-item support.
- Real smoke explicit clear-block expectation mode.
- Real-account evidence that fixed item `34535` no longer enters black mpv playback and leaves no `mpv.exe` process.

## Verification
- `git push`
- Remote updated `c91b5dd..ae00739`.

## Next
- Continue the next user-visible issue without leaving the playback clear-block fix local-only.
