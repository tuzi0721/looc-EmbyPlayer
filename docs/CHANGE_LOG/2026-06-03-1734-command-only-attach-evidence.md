# 2026-06-03 17:34 command-only attach evidence

## Changed
- Increased command-only `visual-smoke.log` tail from 6000 to 16000 characters.
- Made attach detection accept later embedded lifecycle evidence:
  - `embed_attach:complete`
  - `embed_visible:show`
  - `embed_detach:complete`

## Verification
- Passed: `node --check scripts\real-server-visual-smoke.mjs`
- No screenshots were used.

## Next
- Rerun real-account command-only smoke with playback control checks.
