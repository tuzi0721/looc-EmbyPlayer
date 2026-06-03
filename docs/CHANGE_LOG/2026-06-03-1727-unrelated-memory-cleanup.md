# 2026-06-03 17:27 unrelated memory cleanup

## Changed
- Removed the untracked `.cunzhi-memory` scratch files from the project tree.
- Added `.cunzhi-memory/` to `.gitignore` so this external memory scratch folder does not reappear in git status.

## Verification
- Confirmed before deletion that `.cunzhi-memory` only contained small scratch metadata files.
- No screenshots were used.

## Next
- Commit the verified playback/proxy changes and logs so git no longer keeps accumulating this work.
