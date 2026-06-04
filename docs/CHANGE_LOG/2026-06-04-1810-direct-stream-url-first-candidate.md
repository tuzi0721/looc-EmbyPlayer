# 2026-06-04 18:10 - Prefer server DirectStreamUrl as first probe candidate (cross-server robust)

## Why

Emby's Playback Guidelines say the server-provided `MediaSource.DirectStreamUrl` (with
`AddApiKeyToDirectStreamUrl`) is the authoritative delivery URL. Servers differ (root vs `/emby/` subfolder
vs custom base/endpoint), which is why a synthesized `/Videos/{id}/stream.ext` path is unreliable across
servers. The standard Emby reverse-proxy (e.g. linuxserver `emby.subfolder.conf`) exposes the stream under
`location ^~ /emby/` with `proxy_set_header Range`.

## Changed

- `src-tauri/src/emby/models.rs`: added `MediaSource.add_api_key_to_direct_stream_url`
  (`AddApiKeyToDirectStreamUrl`).
- `src-tauri/src/commands/player.rs`: `stream_url_candidates` now probes, in order:
  1. the server `DirectStreamUrl` (resolved absolute/relative to the line base; api key appended per
     `AddApiKeyToDirectStreamUrl`, default-on when no token present) and its `/emby` variant,
  2. the synthesized `/Videos/{id}/stream.ext` and its `/emby` variant.
  First `206` candidate wins (direct, seekable play); `4xx`/`5xx` candidates are skipped.

## Verification

- `cargo fmt --check`, `cargo check --features mpv-embedded`, lints, `npm run tauri:build` (package ok) — passed.
- Account 1 (`yuanshen.help`, original ROOT base, user changed nothing):
  - DirectStreamUrl resolved to `/videos/34817/original.mp4` -> `200`; `/emby/videos/34817/original.mp4`
    -> `206 supported=true` -> selected.
  - FULL smoke: the player plays directly end-to-end. The old black-screen failures
    (`mpv player has no tracks`, `player did not become ready`, `black/blank`) are GONE. Only two minor,
    non-black-screen residuals remain: `search did not return the selected real item` (search indexing) and
    `seek back did not move playback backward` (seek-back nudge nuance; seeking is now possible because real
    `206` Range is in effect). Runtime cleanup clean.
- Account 2 (`cnmbyd.xyz`): the server's `DirectStreamUrl` is a custom `/smartstrm` endpoint that returns
  `404` for our client (as do the synthesized + `/emby` variants). This is a server-specific custom stream
  endpoint; pending that server's reverse-proxy config to resolve. No regression (it was already failing).

## Net effect

- The Range-broken/black-screen issue on standard Emby-behind-proxy servers is resolved by using the
  authoritative DirectStreamUrl and the `/emby` Range-passthrough path, with the local-cache prefetch left
  as a deep fallback for genuinely Range-incapable sources.

## Next

- Commit/push. Resolve account-2 `/smartstrm` 404 once its server config is known. Optionally investigate
  the `seek back` nudge and the search-miss separately.
