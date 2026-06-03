# 2026-06-03 15:18 Command-only connect initial target

## What changed

- Tauri command-only validation now connects to the initial CDP page target immediately, even when the target URL is `about:blank`.
- Bridge readiness now waits in the page context for `window.hillsLite.invoke` and the Vue router.
- Bridge readiness evidence now includes `href`, `title`, `readyState`, route, and `#app` HTML length when startup remains blank.

## Verification

- `node --check scripts\real-server-visual-smoke.mjs`

## Next

- Rerun real-account command-only validation without screenshots. If startup is still blank, the output should now identify the page state instead of losing the websocket target.
