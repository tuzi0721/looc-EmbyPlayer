# 2026-06-01 20:22 收藏历史聚合 Electron 回归

## 背景

用户指出收藏、历史、聚合视界无法正确加载。首页巨幕 smoke 已经能启动本地假 Emby 并登录桌面壳，本阶段把同一 smoke 扩展到个人媒体页面，避免这些页面再次退回空壳或假成功。

## 变更

- 扩展 `scripts/smoke-electron-home-hero.mjs`。
- 本地假 Emby 媒体项补充收藏、已看、最后播放时间与播放百分比。
- smoke 在验证 `/home` 后继续进入 `/favorites`、`/history`、`/aggregate`。
- 对三个页面分别检查媒体标题、卡片数量与错误态。

## 验证

- `node --check scripts\smoke-electron-home-hero.mjs`
- `npm.cmd run dev`
- `node scripts\smoke-electron-home-hero.mjs`
- 验证后停止 dev server。

## 结果

- `/favorites` 渲染 `Giant Screen Smoke`，`posterCount = 1`，无错误态。
- `/history` 渲染电影与剧集历史，`historyCardCount = 2`，无错误态。
- `/aggregate` 渲染继续观看、收藏与最近看过，`posterCount = 4`，无错误态。
- `/home` 巨幕断言继续通过，标题、简介、Backdrop 和海报均来自本地假 Emby 媒体库候选。
