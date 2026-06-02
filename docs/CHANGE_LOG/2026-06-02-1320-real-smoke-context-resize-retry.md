# 2026-06-02 13:20 Real Smoke Context Resize Retry

## Scope
- A real-account smoke rerun was interrupted during detail viewport inspection by `Runtime.evaluate: Execution context was destroyed`.
- Extended the existing CDP context-reset retry to route/resize/metrics reads used by the visual smoke:
  - `resizeAndInspect`
  - personal route checks
  - search check
  - player route open wait
  - player metrics, seek, fullscreen, and resize metrics

## Verification
- Passed: `node --check scripts\real-server-visual-smoke.mjs`

## Notes
- Login/setup remains non-retried to avoid repeating account/server mutations.
- Next step is another full real-account visual smoke run.
