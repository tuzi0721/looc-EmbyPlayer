# 2026-06-04 01:16 - Real Copy Profile Probe

## Summary
- Ran a temporary real-account PlaybackInfo probe for the sampled MP4 item `34535`.
- The probe compared:
  - current direct-only profile
  - DirectPlay disabled with an MKV copy profile
  - DirectPlay disabled with a TS copy profile
- The server still returned the same original MP4 DirectStreamUrl path class for all variants.
- No `TranscodingUrl`, transcoding container, or copy/remux playback path was returned.
- The temporary probe script and credential input were removed after the probe.

## Verification
- Probe used the real account against line 1.
- Output was redacted to path/query-key shape only; no token or full stream URL was logged.
- Follow-up process check found no remaining `emby-player` or `mpv` process.

## Result
- PlaybackInfo cannot currently supply a safe server-side container-copy fallback for this real MP4 source while `EnableTranscoding=false`.

## Next
- Move the fix to the local playback side: do not leave the player black when a Range-broken MP4 cannot be made seekable through PlaybackInfo.
- Add a deterministic local fallback or a clear product error for this media class.
