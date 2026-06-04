# 2026-06-04 17:12 - Range probe `bytes=0-` still returns 200 (server is behind Cloudflare)

## Context

The server maintainer reports that other clients (official / third-party Emby clients and the Emby Web UI)
play these same MP4 sources directly with LOCAL decoding and DO get `206` / working HTTP Range — so the
fault is in how THIS app requests the stream, not the server. A captured Emby Web request shows the server
sits behind Cloudflare (`server: cloudflare`, `cf-ray`, `cf-cache-status: DYNAMIC`) and the Emby API path is
`/emby/...`.

## Hypothesis tested

The Range probe used `Range: bytes=0-0` (a degenerate range). Some origins/CDNs answer `200` (no
`Content-Range`) to `bytes=0-0` but `206` to the canonical open-ended `bytes=0-` that browsers send.

## Change

- `src-tauri/src/stream_proxy.rs`: `probe_range_support` now sends `Range: bytes=0-` instead of
  `bytes=0-0` (matches browsers / official players). This is a strictly more standard probe and is kept.

## Result (DISPROVEN for this server)

- Rebuilt release, ran real-account command-only smoke on Range-broken mp4 item `34817`.
- The probe STILL returns `stream-proxy:range-probe status=200 content_range=false supported=false` for both
  lines, so the source again took the cache-then-local path.
- Conclusion: the `bytes=0-0` vs `bytes=0-` difference is NOT the cause here. The server/Cloudflare returns
  `200` without `Content-Range` even for a proper open-ended Range, while a real browser gets `206`.

## Remaining hypotheses (request-shape difference vs the browser)

The app's stream request differs from the working browser request in ways Cloudflare may key on:
1. A Cloudflare rule / managed transform that strips the `Range` header (or normalizes the response) for
   non-browser User-Agents or requests missing browser headers, so the origin never sees Range → `200`.
2. The request `User-Agent` (`Emby-Player/0.1 (Tauri; libmpv)`) vs a browser UA.
3. The URL path/prefix (`/Videos/...` vs `/emby/Videos/...`) or `Static=true` handling at the edge.
4. `Accept-Encoding: identity` vs the browser's `gzip, deflate, br, zstd`.

## Next

- Decide via 寸止: either (a) the maintainer checks Cloudflare for Range/UA-based rules and/or provides the
  exact browser VIDEO stream request (URL + headers + response), or (b) add a temporary diagnostic that
  issues the stream request through the app's own client with browser-like UA/headers and logs full
  response headers (`Accept-Ranges`, status, CF headers) to pinpoint what flips `200` -> `206`.
