# 2026-05-29 03:07 - Electron 桌面集成

## 本段目标
- 补齐 Electron 路径下此前仍为空操作的桌面能力：托盘入口、播放期间阻止息屏、Now Playing 状态命令和 `rodelplayer://` 深链入口。

## 变更
- 新增 `electron/backend/desktop.mjs`，集中管理 Electron 托盘、协议注册、深链路由、Now Playing 状态和 `powerSaveBlocker`。
- Electron 启动时注册 `rodelplayer://` 协议，并通过 single instance lock 接收二次启动参数；支持跳转播放器、详情页、下载中心、遥控和设置。
- 托盘菜单支持显示/隐藏窗口、进入下载中心、打开通知中心、遥控、设置和退出；托盘 tooltip 会展示播放状态、当前标题、活动下载数和未读通知数。
- 主窗口关闭时改为隐藏到托盘，托盘菜单“退出”会正常关闭应用。
- `set_now_playing`、`set_now_playing_status`、`set_now_playing_position`、`clear_now_playing` 从 Electron 空操作改为真实状态更新；播放中会启动 `prevent-display-sleep`，暂停/停止/清除时释放。

## 验证
- `node --check electron\backend\desktop.mjs`
- `node --check electron\main.mjs`
- `npm.cmd run build`
- `rg -n "[ \t]+$" electron\backend\desktop.mjs electron\main.mjs docs\CURRENT_STATE.md docs\CHANGE_LOG\2026-05-29-0307-electron-desktop-integration.md`（无输出，退出码 1，表示未发现行尾空白）
- `npm.cmd run electron:build`
