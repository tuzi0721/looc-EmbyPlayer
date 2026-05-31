# 2026-05-29 13:10 移除详情页查看全部占位按钮

## 目标

详情页剧集区不再展示没有动作的“查看全部”按钮。

## 变更

- 移除剧集区标题栏右侧的“查看全部”按钮。
- 移除详情页内不再使用的 `.link-btn` 样式。
- 保留季选择器和剧集横向列表作为当前可用入口。

## 验证

已通过：

```powershell
rg -n "查看全部|link-btn" src\views\DetailView.vue
rg "[ \t]+$" src\views\DetailView.vue
npm.cmd run build
npm.cmd run electron:build
```

说明：详情页内无 `查看全部` / `link-btn` 残留；`npm.cmd run build` 与 `npm.cmd run electron:build` 均通过。Electron builder 仍有既有 duplicate dependency references 和 Node DEP0190 提示。

## 当前状态

- 详情页剧集区只保留已接线的季选择和剧集播放入口。
- 如果后续需要“查看全部”整页剧集列表，应新增真实路由或展开视图后再恢复入口。
