# 2026-06-02 13:18 Local Series Fallback Smoke

## Scope
- Re-ran local Electron smoke after the Series cross-season fallback fix.
- Confirmed the fake Emby Series detail play probe and surrounding home/detail/multi-server checks still pass.

## Verification
- Passed: `node scripts\smoke-electron-home-hero.mjs`

## Notes
- Smoke output ended with `ok: true`.
- Next step is the real-account visual smoke with the same Series fallback code.
