# 2026-06-10 20:15 自研播放器运行时随构建 staging + QWindowKit Quick 修复

## 背景
T9c 收尾：把自研 `hills_player.exe` 运行时打进发布产物，并修正 QWindowKit
无边框窗在源码层的两处问题。`tauri.conf.json` 曾试过 `bundle.resources` glob 方案，
但 tauri-build 会全量扫描 186MB 运行时（含曾误拷入的 `_deps/.git`，触发 os error 5），
已弃用，改为 build.rs 阶段复制。

## 变更
- `src-tauri/build.rs`：构建时若存在 `src-tauri/resources/player/`（gitignored，本地由打包
  步骤 staging），整树复制到 `target/<profile>/resources/player/`，使
  `resolve_player_exe()` 在 dev 与 release 运行时都能找到
  `resources/player/hills_player.exe`。目录缺失时跳过（新 clone 不受影响）。
- `player/CMakeLists.txt`：FetchContent 构建 QWindowKit 时强制
  `QWINDOWKIT_BUILD_QUICK=ON`——上游默认 OFF，导致 `QWindowKit::Quick` 缺失、
  无边框特性被静默禁用。
- `player/src/main.cpp`：QWK 头文件名修正 `qwkquickwindowagent.h` →
  `quickwindowagent.h`（上游实际文件名）。

## staging 白名单（本地打包步骤，产物不入库）
`player/build` → `src-tauri/resources/player/`：`hills_player.exe`、顶层 `*.dll`
（Qt6*/libmpv-2/libQWK*/MinGW 运行时/D3Dcompiler_47/opengl32sw）、
`HillsPlayer/`（QML 模块）、`generic/iconengines/imageformats/networkinformation/
platforms/qml/qmltooling/tls/shaders`。排除 CMake/_deps/_build/_install/.git 等构建垃圾。

## 验证
- `npm run tauri:build` 通过（release 7m17s + check:tauri-package 绿，216MiB mpv 资源比对一致）。
- `target/release/resources/player/hills_player.exe` 与 `HillsPlayer/qmldir` 均就位（186MB）。
- 真机 API：ciallo.party 鉴权→列表→PlaybackInfo→流探测 200+Accept-Ranges 全通（06-09）；
  cnmbyd 鉴权/浏览恢复但 PlaybackInfo 挂起（服务端 SmartStrm 层），E2E 改走
  `MediaSource.Path` 路线待复跑。
- C++ 改动（CMake/QWK 头文件）本机无 Qt 工具链未编译验证，需 Qt6 环境复编（残余）。
