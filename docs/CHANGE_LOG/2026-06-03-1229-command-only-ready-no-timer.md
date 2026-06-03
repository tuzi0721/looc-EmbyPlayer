# 2026-06-03 12:29 command-only ready probe without timer

## Scope

- Removed the page-side `setTimeout(1200)` wait from the command-only bridge readiness probe.
- The readiness probe now synchronously reports `window.hillsLite`, router presence, document ready state, and route.

## Evidence

- The `12:26` command-only retry reached `setup-bridge-ready-start` and then hit `Runtime.evaluate timeout` before any backend command.
- That means the readiness probe itself was blocked by the page timer; it was not yet evidence for a server or player command.

## Verification

- `node --check scripts\real-server-visual-smoke.mjs`

## Result

Next run should either pass bridge readiness or fail at a named backend/setup stage.
