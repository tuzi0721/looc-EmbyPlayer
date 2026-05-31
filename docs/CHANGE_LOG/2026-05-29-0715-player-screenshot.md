# 2026-05-29 07:15 - 播放器截图

## 本段目标
- 将播放器底部工具栏的截图能力做成真实可用功能，支持当前 mpv 画面保存为 PNG。

## 变更
- 前端 API 新增 `takeScreenshot`，返回实际保存路径。
- 播放器控制栏新增截图按钮，点击后显示加载态；保存成功或失败都会在播放器内显示短提示，避免打断播放。
- Electron 主进程新增 `take_screenshot` 命令，使用 mpv `screenshot-to-file` 保存到 `.electron-user-data\screenshots`，并写入播放诊断日志。
- Tauri mpv 命令新增 `ScreenshotToFile`，IPC 与 embedded 后端均映射到 mpv `screenshot-to-file`。
- Tauri 新增 `take_screenshot` 命令，截图保存到应用数据目录 `screenshots`，并返回 `filePath`。

## 验证
- `node --check electron\main.mjs` 通过。
- `cargo fmt --manifest-path src-tauri\Cargo.toml` 通过。
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets` 通过。
- `npm.cmd run build` 通过；仍仅有既有 PlayerView chunk 体积警告。
- `rg -n "[ \t]+$" src\api\index.ts electron\main.mjs src-tauri\src\commands\player.rs src-tauri\src\mpv\backend.rs src-tauri\src\mpv\ipc.rs src-tauri\src\mpv\embedded.rs src-tauri\src\lib.rs src\views\PlayerView.vue docs\CURRENT_STATE.md docs\CHANGE_LOG\2026-05-29-0715-player-screenshot.md` 无输出。
- `npm.cmd run electron:build` 通过；仍仅有既有 PlayerView chunk 体积、electron-builder author/duplicate dependency、DEP0190 警告。
