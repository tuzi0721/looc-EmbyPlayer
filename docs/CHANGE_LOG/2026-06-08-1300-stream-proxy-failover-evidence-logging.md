# 2026-06-08 13:00 - Stream/Range robustness: always-on failover & Range evidence logs (P1)

## Why

The recurring playback failures (Range-broken MP4 served as `200` with no `Content-Range`, tail-`moov`
non-faststart files, slow lines) are already handled by the streaming stack:

- `stream_proxy.rs` does an open-ended `bytes=0-` Range preflight (`probe_range_support`) that tolerates the
  CDN/Cloudflare `200`-without-`Content-Range` quirk, plus an mp4 `moov`/`moof` prefix probe
  (`probe_mp4_streamable_prefix`).
- `commands/player.rs` `select_playback_line` classifies each line as seekable / non-seekable-streamable /
  range-broken, and `load_ready_playback_line` already **fails over across candidate lines**; range-broken
  non-faststart MP4 routes to `PlaybackPlan::CacheThenLocal` -> `mp4_prefetch` (download sequentially, play the
  local file where tail-`moov` seeking works). No server transcoding is ever requested.

The gap was **observability**: the rich diagnostics only went to the visual-smoke log file and only when
`HILLS_TAURI_CDP_PORT` is set, so in normal runs there was no evidence of *which* line failed, *why* Range was
considered unsupported, or *when* we fell back to cache-then-local. The P1 acceptance asks for "多线路失败自动
切换且有证据日志". This change adds always-on `tracing` evidence at those decision points without changing any
behavior.

## Approach (logging-only, no behavior change)

- `src-tauri/src/stream_proxy.rs`:
  - `probe_range_support`: emit `tracing::info!(target = "stream-proxy", status, has_content_range,
    content_type, supported, "range preflight")` alongside the existing gated visual log.
  - proxy request handler: `tracing::warn!` when the upstream request errors, and when the upstream returns a
    `>= 400` status, including the (short) route id, method, requested range, and `range_supported` flag.
- `src-tauri/src/commands/player.rs`:
  - `load_ready_playback_line`: `tracing::info!` per line attempt ("trying playback line", line id, attempt #,
    range_supported) and `tracing::warn!` on each failed attempt ("failing over to next candidate line").
  - `select_playback_line`: `tracing::info!` when routing a range-broken non-faststart MP4 to cache-then-local.

These run at the app's default log level (`info,emby_player=debug`), so failover/Range decisions are now
visible in normal logs.

## Build / verify

- `node scripts/check-local-decode-guard.mjs` ok (156 files; no-transcode policy intact).
- `cargo check --release --features mpv-embedded` ok (Finished, 27s incremental).
- No linter errors on touched files.

## Scope / follow-ups

- This slice closes the "evidence logs" acceptance bullet and confirms the existing Range preflight +
  cache-then-local + multi-line failover behavior (acceptance: range-broken MP4 no longer black-screens — it is
  either a clear blocked-error or cache-then-local, deterministically). Buffering visibility is already exposed
  via the mpv snapshot (`demuxer_cache_state`, `network_bps`) and surfaced by the player overlay (frontend / CH-6).
- Deeper future hardening (not in this slice): parallel/concurrent line *racing* (probe candidates
  concurrently and pick the first healthy one rather than sequential preflight), and explicit tail-`moov`
  detection (current logic infers it from "Range unsupported + no streamable prefix").
