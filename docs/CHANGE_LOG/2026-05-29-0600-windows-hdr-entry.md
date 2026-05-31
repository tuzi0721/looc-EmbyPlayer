# 2026-05-29 06:00 - Windows HDR 设置入口

## 本段目标
- 在播放器设置里补充 Windows HDR / 显示设置入口，方便用户从应用内打开系统 HDR 相关设置。

## 变更
- 设置页播放器面板新增 `Windows HDR` 按钮，Windows 平台可用，其他平台禁用。
- 入口复用现有 `api.openExternal`，打开 `ms-settings:display`，Electron 与 Tauri 均沿用既有外部链接能力。

## 验证
- 初轮 `npm.cmd run build` 通过。
- `rg -n "[ \t]+$" src\views\SettingsView.vue docs\CURRENT_STATE.md docs\CHANGE_LOG\2026-05-29-0600-windows-hdr-entry.md` 无输出。
- `npm.cmd run electron:build` 通过；仍仅有既有 PlayerView chunk 体积、electron-builder author/duplicate dependency、DEP0190 警告。
