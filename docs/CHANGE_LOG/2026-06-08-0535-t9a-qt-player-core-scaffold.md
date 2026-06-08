# 2026-06-08 05:35 — T9a/CH-3 self-developed Qt6/QML + libmpv player core (scaffold)

## Added

- New `player/` subproject: standalone `hills_player.exe` (Qt6 Quick/QuickControls2
  + libmpv render API + optional QWindowKit/QCoro, CMake/MSVC), mirroring
  HillsLite's reference `data/player/HillsPlayer.exe` deployment. This is the M2
  "native player process" path chosen after the P0 validation found WebView2
  composition hosting unavailable in Tauri/wry
  (`docs/ROADMAP/m2-libmpv-composition-feasibility.md`).
- `player/CMakeLists.txt`: Qt6 + libmpv discovery (pkg-config / `MPV_ROOT` /
  bundled `src-tauri/resources/mpv` fallback), optional QWindowKit + QCoro,
  `qt_add_qml_module`, Anime4K shader install.
- `player/src/mpv_object.{h,cpp}`: `MpvObject` (`QQuickFramebufferObject`) driving
  the libmpv OpenGL render API (`vo=libmpv`, gpu/gpu-next, `hwdec=auto-safe`,
  `target-colorspace-hint` for HDR). Video is a normal Qt Quick item, so controls
  overlay it with full hit-testing (no native child window / dead zone / pointer
  swallow). Local-decode only; no transcode.
- `player/src/argv_options.{h,cpp}`: mpv-style argv contract
  (`--start/--aid/--sid/--sub-file/--force-media-title/--http-proxy/--volume/`
  `--script/--geometry/--maximize/--fullscreen/--force-window/--anime4k/`
  `--stdin-control` + verbatim `--key=value` passthrough to libmpv).
- `player/src/reporter.{h,cpp}`: stdout `HILLS_MPV_EVENT:` line-JSON reporter
  (`start-file/file-loaded/seek/end-file/time-pos/pause/speed`), **byte-compatible
  with `hills_external_reporter.lua` and the existing Rust host parser**
  (`parse_reporter_event` / `run_external_reporter`) — zero host changes needed.
- `player/src/anime4k.{h,cpp}`: official Anime4K v4 preset → `glsl-shaders` chains
  (`Off/Fast/A/B/C/A+A/B+B/C+A`), resolved from `shaders/anime4k/`, applied via
  mpv `change-list glsl-shaders`; exposed to the T9b UI via `MpvObject.anime4k`.
- `player/src/control_channel.{h,cpp}`: opt-in stdin line-JSON control channel
  (host → player: load/pause/seek/track/property/anime4k/quit), closing the
  bidirectional-control gap CH-5 flagged against `standalone.rs`.
- `player/qml/Main.qml`: player window shell; T9b mounts controls in
  `controlsLayer` over the video.
- `player/README.md`, `player/shaders/anime4k/README.md`: build, runtime layout,
  and the argv / reporter / control contracts.

## Status / verification

- **Not built or visually verified in this environment**: the machine has no
  Qt6/CMake toolchain (`cmake` not found, `QTDIR` empty). Code is
  correct-by-construction against the confirmed reference deployment and the
  canonical mpv render-API + Qt Quick FBO pattern. The acceptance items that
  require execution — CMake build, "libmpv renders a frame", argv playback+resume
  on a real Emby direct stream, Anime4K toggling — must be run on a Qt6 + libmpv
  dev machine. Reporter wire-format compatibility with the host is verifiable by
  inspection against `parse_reporter_event`.

## Alignment

- T9d (CH-2) blueprint, T9c (CH-4) host launch + control, T9b (CH-6) UI + Anime4K.
  Reporter/argv/control contracts documented in `player/README.md`.
