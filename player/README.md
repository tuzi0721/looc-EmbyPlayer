# hills-player — self-developed Qt6/QML + libmpv player (T9a/CH-3)

Standalone native player (`hills_player.exe`) that the emby-player Tauri/Electron
host launches as a separate process. Modeled on HillsLite's reference
`data/player/HillsPlayer.exe` (Qt6 + libmpv render API + QML overlay): the Flutter
/ WebView shell only browses; **playback is a native Qt Quick window** so controls
overlay the video with no native child window, no reserved dead zones, no
rect/DPI sync, and no swallowed pointer. This is the path the M2 P0 validation
(`docs/ROADMAP/m2-libmpv-composition-feasibility.md`) concluded was viable, after
WebView2 composition hosting proved unavailable in Tauri/wry.

Hard constraints: **bundle libmpv only**, **local-decode only**, **never
transcode**. Anime4K is pure-GPU post-processing and does not affect this.

## Stack

- Qt6 Quick / QuickControls2 (Basic style), OpenGL RHI
- libmpv **render API** (`mpv_render_context`, OpenGL) via `QQuickFramebufferObject`
  — `vo=libmpv` (gpu/gpu-next internally), `hwdec=auto-safe`,
  `target-colorspace-hint=yes` for HDR
- QWindowKit (frameless window) — optional, auto-detected
- QCoro (coroutines) — linked when available
- CMake + MSVC (Windows)

## Layout

```
player/
  CMakeLists.txt          build system (Qt6 + libmpv + optional QWindowKit/QCoro)
  src/
    main.cpp              app bootstrap, argv apply, window, stdin control wiring
    argv_options.{h,cpp}  mpv-style argv contract parser
    mpv_object.{h,cpp}    QQuickFramebufferObject libmpv render integration
    reporter.{h,cpp}      stdout HILLS_MPV_EVENT: JSON reporter
    anime4k.{h,cpp}       Anime4K v4 preset → glsl-shaders chains
    control_channel.{h,cpp} stdin line-JSON control (opt-in)
  qml/Main.qml           player window shell (T9b mounts controls in controlsLayer)
  shaders/anime4k/       drop official Anime4K v4 *.glsl here
```

## Build (developer machine)

Prerequisites: Qt 6.5+ (Quick, QuickControls2, Network), libmpv **dev** package
(headers `mpv/render_gl.h` + import lib), CMake 3.21+, MSVC, and optionally
QWindowKit + QCoro (vcpkg/FetchContent). libmpv runtime (`libmpv-2.dll`) already
ships in `../src-tauri/resources/mpv`; only the **headers + .lib** must be
provided via `MPV_ROOT`.

```
cmake -S player -B player/build -G Ninja ^
      -DCMAKE_PREFIX_PATH="C:/Qt/6.8.0/msvc2022_64" ^
      -DMPV_ROOT="C:/dev/libmpv"
cmake --build player/build --config Release
```

> Status: this is the **core scaffold**. It was authored to match the confirmed
> reference deployment and is correct-by-construction, but **was not compiled or
> visually verified in this environment** — the machine has no Qt6/CMake
> toolchain (`cmake` absent, `QTDIR` empty). Building + the "renders a frame" /
> "Anime4K switchable" acceptance must be run where Qt6 + libmpv dev exist.

## Contracts

### argv (host → player)

Positional stream/file URL, plus:
`--start=<sec|hh:mm:ss>` `--aid=<id>` `--sid=<id>` `--sub-file=<path>` (repeatable)
`--force-media-title=<t>` `--http-proxy=<url>` `--volume=<0-200>` `--script=<path>`
`--geometry=WxH+X+Y` `--maximize` `--fullscreen` `--force-window=<yes|no|immediate>`
`--anime4k=<preset>` `--stdin-control`. Any other `--key=value` is forwarded
verbatim to libmpv.

### stdout reporter (player → host)

Newline-delimited `HILLS_MPV_EVENT:{json}`, **identical to
`hills_external_reporter.lua` and the host parser**
(`crate::mpv::backend::parse_reporter_event`,
`crate::emby::run_external_reporter`). Events: `start-file`, `file-loaded`
(`time_pos`,`media_title`,`path`), `seek` (`time_pos`), `end-file`
(`reason`,`time_pos`), `time-pos` (throttled ~1/s), `pause` (`paused`),
`speed` (`speed`). The existing Rust host consumes this unchanged.

### stdin control (host → player, opt-in via `--stdin-control`)

Line JSON: `{"action":"loadfile","url":"..."}`, `pause`/`play`/`toggle-pause`/
`stop`, `{"action":"seek","value":N,"mode":"absolute|relative"}`,
`set-audio`/`set-sub`/`add-sub`, `{"action":"set-property","name":..,"value":..}`,
`set-speed`/`set-volume`, `{"action":"anime4k","preset":"A"}`,
`{"action":"command","args":[..]}`, `quit`.
**Field names to be confirmed with CH-4 (T9c host) before wiring.**

## Alignment

- T9d (CH-2): blueprint/reference recipe — this mirrors the confirmed HillsPlayer
  deployment (Qt6 Quick/Controls2 + QCoro6 + QWindowKit).
- T9c (CH-4): host launches `hills_player.exe` with the argv above, reads the
  stdout reporter (already parseable by the existing Rust bridge), and may use the
  stdin control channel.
- T9b (CH-6): builds the control UI in `qml/Main.qml`'s `controlsLayer` and drives
  Anime4K via `MpvObject.anime4k` / `setAnime4kPreset()`.
