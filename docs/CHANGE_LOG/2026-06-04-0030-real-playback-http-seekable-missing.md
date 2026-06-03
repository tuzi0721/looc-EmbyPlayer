# 2026-06-04 00:30 - Real Playback Http Seekable Missing

## Summary
- Recorded the real-account playback failure after the Range preflight release.
- The real server still returned non-seekable Range behavior: the preflight marked the upstream as unsupported (`200 OK` without `Content-Range`).
- The attempted mpv override was wrong for the bundled runtime: current bundled mpv exposes no `http-seekable` option/property, so `set_property("http-seekable", ...)` failed with `property not found` and blocked `loadfile`.

## Evidence
- Bundled command-line frontend reports mpv `v0.41.0-687-gdb7385799`.
- `mpv.com --list-options` shows no `http-seekable`; related available options include `demuxer-lavf-o`, `demuxer-seekable-cache`, and `force-seekable`.
- `mpv.com --input-cmdlist` confirms `loadfile url [flags] [index] [options=Key/value list]`.
- Official mpv manual states the fourth `loadfile` argument is per-file options and, since mpv `0.38.0`, the third argument must be `-1` when passing that fourth argument.
- FFmpeg protocol documentation confirms HTTP protocol option `seekable=0` marks an HTTP resource as non-seekable.

## Verification
- `git status --short`
- `git diff --name-only`
- `mpv.com --version`
- `mpv.com --list-options | rg -n "http-seek|seekable|tls-verify|network-timeout"`
- `mpv.com --input-cmdlist | rg -n "loadfile|set_property|set"`

## Next
- Remove the invalid runtime `http-seekable` property writes.
- Pass per-file non-seekable behavior through valid mpv/FFmpeg options, starting with `demuxer-lavf-o=seekable=0` for range-broken local-proxy URLs.
- Rebuild and rerun the real-account command-only playback guard; do not treat UI control visibility as playback success unless mpv reaches a real loaded video state.
