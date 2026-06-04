# 2026-06-04 15:59 - Stream-readiness diagnosis: Range-broken non-faststart MP4 clear-block

## Scope

- Diagnostic round only. No product code changed.
- Goal: explain why the player stays black / `no tracks` even for a normal 1080p mp4, using real backend
  evidence from the stream-readiness chain (`stream_proxy` + `load_ready_playback_line` + mpv load).

## Method

- Ran a command-only Tauri release smoke pinned to account 1's mp4 episode `34817`
  (`HILLS_REAL_COMMAND_ONLY=1`, `HILLS_REAL_ITEM_ID=34817`, `HILLS_REAL_VISUAL_KEEP_ARTIFACTS=1`) and read
  the backend `visual-smoke.log`.

## Decisive evidence (visual-smoke.log for item 34817, mp4 h264/aac 1920x1080, DirectPlay)

```
play:range-probe-line-start id=real-line-1
stream-proxy:range-probe status=200 content_range=false content_type=video/mp4 supported=false
play:mp4-prefix-probe-start id=real-line-1
stream-proxy:mp4-prefix-probe status=200 bytes=2097152 moov=false moof=false mdat=true streamable=false
play:range-probe-line-start id=real-line-2
stream-proxy:range-probe status=200 content_range=false ... supported=false
stream-proxy:mp4-prefix-probe status=200 bytes=2097152 moov=false moof=false mdat=true streamable=false
play:blocked-range-broken-mp4
```

- `backendReachedLoad=false`, `backendCompletedLoad=false` — mpv is NEVER asked to load.
- Player state stays idle (`idleActive=true`, `trackCount=0`, `duration=0`); the player UI shows the clear
  error "无法本机直连播放：…服务器不支持 HTTP Range，且文件开头没有可流式播放的索引…" plus a "下载后播放" action.

## Root cause (this is the SECOND, separate root cause; not the lifecycle race)

The "black / no tracks" is NOT a load-chain bug — it is the INTENTIONAL `play:blocked-range-broken-mp4`
clear-block. For these sources:

1. The server returns the mp4 with HTTP `200` and NO `Content-Range` for a `Range: bytes=0-0` probe, i.e.
   the chosen DirectStream/DirectPlay URL does NOT honor HTTP Range (Range is stripped/unsupported).
2. The file is NOT faststart: the first 2 MiB contains `mdat` but no `moov`/`moof`, so the `moov` atom is
   at the tail of the file. Without Range there is no way to seek to the tail to read the index.
3. mpv therefore cannot demux it, so the backend blocks BEFORE loading mpv and returns a clear local-decode
   error (by design, to avoid a silent black player and to never ask the server to transcode).

Both lines of account 1's server behave this way, and account 2's HEVC source plus `502`/network errors
showed the same dead-end. So on the available test servers, the common real media is "Range stripped +
moov at tail", which the current code can only clear-block, not play.

## Fix direction (NOT implemented; needs a decision)

- A. Transparent download-to-temp then local play: when a source is Range-broken + non-faststart, the
  stream proxy (or a helper) downloads the whole file sequentially to a temp file, then serves/plays it
  locally with real Range support so mpv can read the tail `moov`. The project already has
  `下载后播放` / download-autoplay scaffolding to build on.
- B. Whole-file buffering proxy that starts mpv only once the file is fully (or sufficiently) cached
  locally — a streaming variant of A; more complex.
- C. Verify/repair the existing manual `下载后播放` path end-to-end as the supported workaround.
- D. Probe alternate server endpoints that may honor Range (e.g. `static=true` stream, the raw
   `/Items/{id}/Download`, or a `videos/{id}/stream?static=true` form). If one is Range-capable, prefer it
   and avoid the whole-download cost. Cheapest real fix IF such an endpoint exists.

## Cleanup

- Credential input file deleted by the smoke after reading; kept artifact temp dir removed afterward; no
  `emby-player.exe` / `mpv.exe` left running.

## Next

- Decide via 寸止 which fix direction to take (recommend D first as a cheap probe, then A as the robust
  fallback), then implement + rebuild + re-run command-only smoke on item `34817`.
