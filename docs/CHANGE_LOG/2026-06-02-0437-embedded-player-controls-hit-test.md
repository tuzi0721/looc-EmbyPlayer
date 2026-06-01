# 2026-06-02 04:37 - 内嵌播放器控制条命中修复
## 变更

- `PlayerView` 在控制条显示时按真实顶栏/底栏高度计算内嵌 mpv 宿主矩形，让原生视频窗口避开 Web 控制区，避免进度条、后退、播放、全屏等按钮被 popup 视频窗口盖住。
- `electron_mpv_host` 对 `WM_NCHITTEST` 返回 `HTTRANSPARENT`，让鼠标移动/点击可以落回 WebView 控制层，避免控制条隐藏后无法被鼠标唤醒。
- embedded smoke 包装 `api.embedSetRect`，记录每次传给原生宿主的矩形，并断言正常窗口、全屏和缩小窗口下矩形都避开顶栏与底栏。
- 重建 release 版 `electron_mpv_host.exe`，确保后续 Electron 打包或运行使用新的 hit-test 行为。

## 验证

- `node --check scripts\smoke-electron-embedded-local.mjs`
- `npm.cmd run build`
- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- `npm.cmd run build:electron-helper`
- `node scripts\smoke-electron-embedded-local.mjs`
- `git diff --check`
