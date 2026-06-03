# Git sync: real smoke playback selection (2026-06-04 03:19)

## Summary

- Committed and pushed the real smoke playback selection hardening phase to `main`.
- Commit: `2e756cd Harden real smoke playback selection`
- Remote update: `38767a9..2e756cd`

## Included

- `HILLS_REAL_SKIP_ITEM_IDS` support for `scripts/real-server-visual-smoke.mjs`.
- Real playback pass with bad item `34535` skipped and item `34503` selected.
- Fixed clear-block regression pass for item `34535`.
- Phase log: `docs/CHANGE_LOG/2026-06-04-0318-real-smoke-skip-clearblock-item.md`

## Next

- Continue the next user-visible gap with real-account validation and immediate docs/git sync after the phase.
