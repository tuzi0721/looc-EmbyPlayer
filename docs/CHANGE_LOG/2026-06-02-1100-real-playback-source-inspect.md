# 2026-06-02 11:00 Real PlaybackInfo source inspect

## Scope
- Added a sanitized real PlaybackInfo inspection script for media-source capability checks.
- Queried the real selected item from the failed visual smoke without recording credentials, tokens, full server URLs, playback URLs, or file paths.

## Validation
- `node --check scripts\real-server-playback-source-inspect.mjs` passed.
- `git diff --check scripts\real-server-playback-source-inspect.mjs` passed.
- The sanitized real query returned 2 media-source candidates.

## Result
- Both real media-source candidates are MKV and both report direct play/direct stream support with transcoding disabled.
- Candidate 1 is H264/AAC in MKV.
- Candidate 2 is HEVC/FLAC in MKV.
- There is no HTML-video-compatible MP4/MOV source to select for this item without changing the server request into transcoding.

## Next
- Treat Electron HTML video as a visible fallback for browser-compatible sources only.
- Restore a real local-player path for Electron MKV playback, while keeping server transcoding disabled.
- Continue compact home hero ratio and search fixes after playback can pass real MKV visual testing.
