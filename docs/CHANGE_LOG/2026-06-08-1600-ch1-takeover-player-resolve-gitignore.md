# 2026-06-08 16:00 CH-1 接管：自研播放器解析修正 + 仓库卫生 + 里程碑提交

## 背景
其余执行通道（CH-2/3/4/5/6）虽在线但未消费队列任务，用户授权 CH-1 接管关键路径，把"自研 Qt6/QML + libmpv 播放器"里程碑落库并推送。

## 变更
- `src-tauri/src/mpv/standalone.rs`：`resolve_player_exe()` 现接受自研产物名 `hills_player.exe`
  （`resources/player/hills_player.exe`、开发期 `player/build/hills_player.exe`），此前只认
  `player.exe`/`HillsPlayer.exe`，与实际构建产物不符。
- `.gitignore`：忽略 `/player/build/`（≈200MB Qt/libmpv 运行时与 CMake 产物）与
  `/src-tauri/resources/player/`（打包期复制进来的运行时），避免大体积二进制入库。
- 提交自研播放器子工程**源码**（`player/`：CMakeLists、qml、shaders/anime4k、src/*.cpp），
  此前整目录未跟踪，有丢失风险。
- 同批纳入 T9a/T9b/T9c 既有未提交工作：宿主集成 + 控制 IPC、`anime4k.rs`、Anime4K glsl 管线、
  播放器/设置 UI 改动。

## 验证
- `cargo check --features mpv-embedded` 通过（29s）。
- `npm run build`（含 check:local-decode / check:no-planned-ui / vue-tsc / vite）通过（5.36s）。
- 密钥扫描无命中；`git add player` 干跑确认仅源码入库、`player/build/` 已被忽略（leak=0）。
- 仅本机解码硬约束不变；运行时二进制不入库。

## 残余 / 下一步
- 完整安装包：把 `player/build` 运行时复制进 `src-tauri/resources/player/`（已 gitignore）后
  `npx tauri build --features mpv-embedded` 产物含 player —— 属本地/发布步骤，不入库。
- 真机 T10：用测试账号（.strm → MediaSource.Path、线路 yl 正常/yl1 坏、mpv 非浏览器 UA）跑完整链路。
