# 2026-05-29 03:50 - 聚合视界实用化

## 本段目标
- 将“聚合视界”从占位页改为可用入口，先聚合当前账号下的搜索、继续观看、收藏与播放历史。

## 变更
- `AggregateView` 新增聚合搜索，输入后直接调用现有 `api.search` 并展示海报网格。
- 聚合页概览接入继续观看、收藏、最近看过三组内容；收藏与历史支持跳转到对应完整页面。
- 新增概览/收藏/历史分段控件、刷新按钮、加载态、错误重试和空状态。
- 收藏与历史数据复用现有 `list_items` / `api.playbackHistory`，不新增后端协议。

## 验证
- 通过 `npm.cmd run build`，保留既有 PlayerView chunk 警告。
- 通过 `rg -n "[ \t]+$" src\views\AggregateView.vue docs\CURRENT_STATE.md docs\CHANGE_LOG\2026-05-29-0350-aggregate-view.md`，未发现行尾空白。
- 通过 `npm.cmd run electron:build`，Electron unpacked 产物保持在 `release-electron\win-unpacked\Hills Lite.exe`，保留既有 author/重复依赖/DEP0190 与 chunk 警告。
