# 2026-05-29 03:15 - Electron 关闭到托盘设置

## 本段目标
- 让设置页“关闭时最小化到托盘”从禁用占位变为真实可控的 Electron 桌面行为。

## 变更
- `AppSettings` / Electron 默认设置新增 `closeToTray`，默认开启。
- Electron 桌面集成会加载并缓存该设置；更新设置后会刷新桌面集成缓存。
- 主窗口关闭时按 `closeToTray` 决定隐藏到托盘或直接退出，托盘菜单“退出”仍会强制退出。
- 设置页“关闭时最小化到托盘”接入真实开关并持久化。

## 验证
- `node --check electron\backend\store.mjs`
- `node --check electron\backend\desktop.mjs`
- `node --check electron\main.mjs`
- `npm.cmd run build`
- `rg -n "[ \t]+$" electron\backend\store.mjs electron\backend\desktop.mjs electron\main.mjs src\types\models.ts src\stores\settings.ts src\views\SettingsView.vue docs\CURRENT_STATE.md docs\CHANGE_LOG\2026-05-29-0315-electron-close-to-tray-setting.md`（无输出，退出码 1，表示未发现行尾空白）
- `npm.cmd run electron:build`
