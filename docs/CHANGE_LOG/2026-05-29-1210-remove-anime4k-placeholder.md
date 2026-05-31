# 2026-05-29 12:10 移除 Anime4K 占位入口

## 目标

播放器设置菜单只展示当前可用的功能，不再放置没有后端支撑的画质增强占位入口。

## 变更

- 移除播放器设置菜单中的 `Anime4K PRO` 占位按钮。
- 移除仅服务该占位按钮的 `.pro` 样式。
- 保留现有画面模式、自动跳过片头/片尾、截图包含字幕、字幕设置、弹幕设置、外部播放器和统计信息入口。

## 验证

已通过：

```powershell
Select-String -Path src\views\PlayerView.vue -SimpleMatch 'Anime4K'
Select-String -Path src\views\PlayerView.vue -SimpleMatch 'class="pro"'
rg "[ \t]+$" src\views\PlayerView.vue
npm.cmd run build
npm.cmd run electron:build
```

说明：`Anime4K` 与 `class="pro"` 无残留；`npm.cmd run build` 与 `npm.cmd run electron:build` 均通过。Electron builder 仍有既有 duplicate dependency references 和 Node DEP0190 提示。

## 当前状态

- 播放器设置菜单不再出现不可点击的画质增强假入口。
- 画质增强/Anime4K 后续若要实现，需要单独接入 mpv shader 或滤镜配置后再恢复入口。
