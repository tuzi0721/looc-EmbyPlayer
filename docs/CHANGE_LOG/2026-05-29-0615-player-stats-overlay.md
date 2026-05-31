# 2026-05-29 06:15 - 播放器 Stats 浮层

## 本段目标
- 将播放器设置菜单中的“统计信息”占位改为可用的会话内 Stats 浮层。

## 变更
- 播放器新增 `statsOpen` 状态，设置菜单“统计信息”可开关浮层，`Esc` 可关闭。
- Stats 浮层读取现有播放器 snapshot / HTML fallback 状态，展示时间、进度、速度、音量、缓存、网络、当前音轨、当前字幕和轨道数量。
- 新增右上角 Stats 面板样式，使用紧凑两列布局，避免遮挡底部控制条。

## 验证
- 初轮 `npm.cmd run build` 通过。
- `rg -n "[ \t]+$" src\views\PlayerView.vue docs\CURRENT_STATE.md docs\CHANGE_LOG\2026-05-29-0615-player-stats-overlay.md` 无输出。
- `npm.cmd run electron:build` 通过；仍仅有既有 PlayerView chunk 体积、electron-builder author/duplicate dependency、DEP0190 警告。
