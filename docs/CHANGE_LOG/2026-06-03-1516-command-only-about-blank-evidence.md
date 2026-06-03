# 2026-06-03 15:16 Command-only about:blank evidence

## What happened

- Reran real-account command-only validation against the rebuilt Tauri release.
- The verifier selected the only CDP page target:
  - `selectedUrl: "about:blank"`
  - `selectedTitle: ""`
  - `pages.length: 1`
- No Rust `crash.log` was produced.
- `visual-smoke.log` only recorded CDP/WebView data-dir configuration.
- The temp credential input file was deleted.

## Finding

- The app still does not prove frontend startup. The WebView target remains `about:blank` before login/backend requests.
- The verifier waited too long for a non-blank URL before connecting, so the websocket URL went stale and failed with `websocket error`.

## Next

- Connect to the initial Tauri page target immediately, even when it is `about:blank`.
- Move the waiting logic into the page context and wait for `window.hillsLite.invoke` plus the Vue router before attempting real login.
