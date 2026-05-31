# 2026-05-29 07:55 - 全屏副屏遮黑
## 本段目标
- 在设置/播放器中提供默认关闭的手动开关；开启后，播放器进入全屏时自动遮黑非播放显示器，退出全屏或关闭播放器时自动清理。

## 变更
- `AppSettings`、Electron store、Tauri config 与设置更新命令新增 `blackoutOtherDisplays`，默认关闭。
- 设置页播放器面板新增“全屏遮黑其他副屏”开关。
- 前端 API 新增 `setSecondaryDisplayBlackout`；播放器监听 `fullscreenchange` 与该设置变化，进入全屏时开启遮黑，退出全屏、关闭播放器或卸载视图时关闭遮黑。
- Electron 主进程新增基于 `screen` 的副屏黑窗管理：为非播放显示器创建无边框、全屏、置顶、不可聚焦的黑色 `BrowserWindow`，并在显示器变化、窗口关闭、隐藏到托盘或应用退出时清理。
- Tauri 命令新增 `set_secondary_display_blackout`：关闭时清理既有遮黑窗口，开启时为非当前显示器创建全屏置顶的 `blackout.html` 窗口。
- 新增 `public/blackout.html`，确保 Tauri 构建产物中有可复用的黑屏页面；Electron 使用内联 data URL 作为黑窗内容。
- 顺手修正 Electron 主进程里 `mainWindow` 与 `randomUUID` 的显式绑定，避免置顶/截图等边缘路径依赖未声明变量。

## 验证
- `node --check electron\main.mjs` 通过。
- `node --check electron\backend\store.mjs` 通过。
- `cargo fmt --manifest-path src-tauri\Cargo.toml` 通过。
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets` 通过。
- `npm.cmd run build` 通过；仍仅有既有 PlayerView chunk 体积警告。
- `Test-Path dist\blackout.html` 返回 `True`。
- `rg -n "[ \t]+$" electron\main.mjs electron\backend\store.mjs public\blackout.html src\api\index.ts src\stores\settings.ts src\types\models.ts src\views\PlayerView.vue src\views\SettingsView.vue src-tauri\src\commands\player.rs src-tauri\src\commands\settings.rs src-tauri\src\config\models.rs src-tauri\src\lib.rs` 无输出。
- `npm.cmd run electron:build` 通过；仍仅有既有 PlayerView chunk 体积、electron-builder author/duplicate dependency、DEP0190 警告。
- 本轮未做真实多显示器人工视觉实测；已完成命令路径、构建产物和打包验证。
