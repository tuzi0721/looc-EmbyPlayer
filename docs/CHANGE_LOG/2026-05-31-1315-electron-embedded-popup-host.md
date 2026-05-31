# Electron 内嵌播放 owned popup 宿主

## 背景

Electron 主窗口内的 Win32 child HWND 会被 Chromium 合成层挡住，mpv 自身有彩色帧但用户可见窗口仍黑屏。

## 改动

- `electron_mpv_host` 改为创建由主窗口拥有的无边框 popup 宿主窗口，而不是主窗口内部的 `WS_CHILD`。
- Electron 继续按播放器 stage 的屏幕坐标同步宿主窗口位置和尺寸，视觉上保持播放器内嵌。
- 主窗口撤回透明窗口实验，恢复普通黑色背景。
- mpv 内嵌模式只保留 `--d3d11-flip=no`，恢复 `hardwareDecoding` 设置对内嵌播放生效，避免诊断参数长期禁用硬解。
- Electron 打包链新增 `build:electron-helper`，并把 `electron_mpv_host.exe` 复制进 `resources`；`check:electron-package` 会同时校验 helper 和随包 mpv。
- 本地 embedded smoke 新增 mpv 自截图与屏幕截图双重像素检查。

## 验证

- `node --check electron/main.mjs`
- `node --check electron/backend/mpv.mjs`
- `node --check scripts/smoke-electron-embedded-local.mjs`
- `node --check scripts/check-electron-package.mjs`
- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- `npm.cmd run check:electron-commands`
- `npm.cmd run build:electron-helper`
- Electron embedded smoke：`ok = true`，屏幕截图 `brightRatio = 1`、`colorfulRatio = 0.9898`，mpv 自截图 `brightRatio = 1`、`colorfulRatio = 1`。
- `npm.cmd run electron:build` 通过，Electron unpacked 产物确认含 6 个随包 mpv 文件和 `resources\electron_mpv_host.exe`。

## 下一步

整理 Git 状态，做敏感信息扫描后提交本地修复；远端 push 仍取决于本机 GitHub 写入凭据。
