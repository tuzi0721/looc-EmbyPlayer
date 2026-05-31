# 2026-05-29 12:25 移除播放器版本占位按钮

## 目标

播放器底栏不再展示没有点击行为的“版本”按钮，避免用户误以为已支持媒体版本/媒体源切换。

## 变更

- 移除播放器底部控制区的“版本”图标按钮。
- 保留音轨、字幕、弹幕、设置、章节、选集等已接线入口。

## 验证

已通过：

```powershell
Select-String -Path src\views\PlayerView.vue -SimpleMatch 'title="版本"'
Select-String -Path src\views\PlayerView.vue -SimpleMatch 'lucide:clapperboard'
rg "[ \t]+$" src\views\PlayerView.vue
npm.cmd run build
npm.cmd run electron:build
```

说明：`title="版本"` 与 `lucide:clapperboard` 在播放器内无残留；`npm.cmd run build` 与 `npm.cmd run electron:build` 均通过。Electron builder 仍有既有 duplicate dependency references 和 Node DEP0190 提示。

## 当前状态

- 播放器底栏不再有无响应的版本占位按钮。
- 多版本/媒体源切换仍未实现，需要后续单独接入 PlaybackInfo 媒体源列表和切换 UI。
