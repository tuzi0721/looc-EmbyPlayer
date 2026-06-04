# 2026-06-04 16:10 - Option D probe: alternate Range-capable endpoint (blocked / unproductive)

## Scope

- Investigation round only. No product code changed.
- Goal (Option D): determine whether the server exposes any HTTP-Range-capable endpoint, so playback could
  switch to it instead of the whole-file download fallback.

## What was tried

- Wrote a bounded, header-only probe (`.tmp/range-endpoint-probe.mjs`, since deleted) that authenticates,
  reads PlaybackInfo for account 1's item `34817`, then sends `Range: bytes=0-1` to candidate endpoints
  (`Videos/{id}/stream.mp4?Static=true`, `stream` no-ext, `Items/{id}/Download`, `stream.mp4` no-static,
  and the PlaybackInfo `DirectStreamUrl`), reading only response headers.

## Result

- The external probe could NOT authenticate: `POST /Users/AuthenticateByName` returned `403`, even after
  matching the app's `x-emby-authorization` header and `Emby-Player/0.1 (Tauri; libmpv)` User-Agent.
- The in-app login (Rust `reqwest`) succeeds against the same server, so the `403` is the server's
  front proxy / WAF (likely Cloudflare) rejecting a non-app client by TLS/HTTP fingerprint. An external
  Node/undici client cannot probe these endpoints.
- Decisive existing evidence (from the app's own WAF-passing client during the 15:59 command-only run):
  the primary `Videos/{id}/stream.mp4?...&Static=true` endpoint already returns `200` with NO
  `Content-Range` (Range unsupported). Historical `docs/CHANGE_LOG/2026-06-04-0121-real-dynamic-endpoint-probe-timeout.md`
  and `...0116-real-copy-profile-probe.md` likewise found alternate stream/copy endpoints did not help.

## Conclusion

- Option D is unproductive on these servers: Range is stripped at the reverse-proxy/WAF layer, so switching
  Emby endpoints will not produce a Range-capable stream, and an external probe is firewalled out anyway.
- Recommend pivoting to Option A: when a source is Range-broken + non-faststart, transparently download the
  whole file to a temp path (sequential, no Range needed) and play it locally with real Range support so
  mpv can read the tail `moov`. The project already has `下载后播放` / download-autoplay scaffolding.

## Cleanup

- Probe script and credential JSON were deleted. No residual processes.

## Next

- Confirm the pivot to Option A via 寸止, then implement and validate on item `34817`.
