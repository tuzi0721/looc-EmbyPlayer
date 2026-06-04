# 2026-06-04 17:46 - Auto `/emby` stream-URL fallback restores HTTP Range (real fix; cache becomes deep fallback)

## Root cause (confirmed with the maintainer's nginx config)

The server sits behind nginx + Cloudflare. Only the `location ^~ /emby/` block passes the client `Range`
header through and disables proxy buffering/cache (`proxy_set_header Range $http_range; proxy_cache off;
proxy_buffering off`). Requests to the bare path (`/Videos/{id}/stream...`) hit the generic cached/buffered
location, which returns `200` without `Content-Range`. The app was requesting the bare path, so it saw
"Range unsupported" and fell back to caching — while browsers / official Emby clients request `/emby/...`
and get `206`.

This is server-routing specific: a second test server returns `404` for `/emby/Videos/...` (it serves at
the root), so always forcing `/emby` is wrong. The fix must be probe-driven.

## Changed (Option C: probe-driven `/emby` fallback)

- `src-tauri/src/stream_proxy.rs`
  - `probe_range_support` now returns `(status, range_supported)` and the open-ended `Range: bytes=0-`
    (browser-style) instead of `bytes=0-0`, so callers can skip `404`/error candidates.
- `src-tauri/src/commands/player.rs`
  - New `stream_url_candidates(primary)` / `with_emby_prefix(url)`: for each line, probe the configured
    path first, then an `/emby`-prefixed variant.
  - `select_playback_line` now evaluates candidates per line: a `206` candidate wins (seekable, direct
    play); a `200` candidate is used as a non-seekable / cache-then-local source after the MP4 prefix
    check; `4xx`/`5xx` candidates are skipped. The winning candidate URL is what gets streamed.
  - The cache-then-local prefetch (from `759905a`) is now a DEEP fallback, only used when no candidate on
    any line supports Range and the MP4 prefix is not streamable.

## Verification

- `cargo fmt --check`, `cargo check --features mpv-embedded`, lints, `npm run tauri:build` (package ok) — all passed.
- Real-account command-only smoke on item `34817` with the server configured at its ORIGINAL ROOT base
  (`https://yuanshen.help/`, user did NOT change config):
  - `/Videos/34817/stream.mp4` -> `status=200 supported=false`
  - `/emby/Videos/34817/stream.mp4` -> `status=206 supported=true` -> selected
  - `play:mpv-ready-wait-complete` -> direct streaming played; smoke `ok=true` (exit 0).
- Earlier zero-code check (server base set to `/emby`) independently confirmed `206` + direct play.

## Known follow-up

- Test server 2 (`cnmbyd.xyz`) returns `404` for the stream URL at BOTH root and `/emby` — a different,
  server-specific path issue (its web UI is also blocked). Pending that server's reverse-proxy config to
  finish; the `/emby` candidate already covers it if/when its correct path is the `/emby` one. Consider also
  probing the PlaybackInfo `DirectStreamUrl` as an additional candidate once its config is known.

## Next

- Commit/push this phase. Then resolve server-2's `404` once its proxy config is available.
