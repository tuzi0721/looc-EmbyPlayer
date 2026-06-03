# Git sync: playback line Range failover (2026-06-04 02:55)

## Result

- Committed and pushed the playback line Range failover phase to `main`.
- Commit: `c7b0221 Add playback line range failover`.
- Remote updated: `32a2f7c..c7b0221`.

## Included

- Automatic playback tries active line first, then enabled non-down fallback lines.
- Explicit user-selected playback line remains explicit.
- Per-line Range probing before mpv load.
- MP4/M4V/MOV no-Range sources still require streamable prefix metadata before playback.
- Real fixed-item clear-block validation passed with no mpv residue.

## Next

- Make the Range-broken MP4 download-to-local path more direct.
