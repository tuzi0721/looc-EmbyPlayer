# 2026-05-29 06:30 - 播放器窗口置顶

## 本段目标
- 将播放器顶部的“置顶”图标从占位改为可用的窗口置顶开关。

## 变更
- 前端 API 新增 `setAlwaysOnTop`，统一调用 `set_always_on_top` 命令。
- Electron 主进程新增 `set_always_on_top` 分支，通过当前窗口或主窗口调用 `BrowserWindow.setAlwaysOnTop`。
- Tauri 新增 `set_always_on_top` 命令并注册到 invoke handler，调用当前窗口的置顶能力。
- 播放器顶部置顶按钮新增 active 状态和切换逻辑，离开播放器时会尝试恢复非置顶。

## 验证
- `cargo fmt --manifest-path src-tauri\Cargo.toml` 通过。
- `node --check electron\main.mjs` 通过。
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets` 通过。
- `npm.cmd run build` 通过。
- `rg -n "[ \t]+$" src\api\index.ts electron\main.mjs src-tauri\src\commands\player.rs src-tauri\src\lib.rs src\views\PlayerView.vue docs\CURRENT_STATE.md docs\CHANGE_LOG\2026-05-29-0630-player-always-on-top.md` 无输出。
- `npm.cmd run electron:build` 通过；仍仅有既有 PlayerView chunk 体积、electron-builder author/duplicate dependency、DEP0190 警告。
