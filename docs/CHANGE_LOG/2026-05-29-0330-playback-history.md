# 2026-05-29 03:30 - 播放历史入口

## 本段目标
- 补齐路线图中的播放历史基础入口，让用户能从侧边栏进入最近看过的电影与剧集列表，并按类型快速筛选。

## 变更
- 新增 `/history` 路由与 `HistoryView`，支持全部/电影/剧集分段筛选、刷新、分页加载、空状态、错误重试和海报卡片进入详情。
- 侧边栏新增“历史”入口，并在当前路由为历史页时保持 active 状态。
- `api.playbackHistory` 复用 Emby/Jellyfin `list_items` 能力，按 `Filters=IsPlayed` 与 `SortBy=DatePlayed` 拉取最近播放记录。
- `UserData` 增加 `LastPlayedDate`，Electron 与 Tauri 解码侧都会保留该字段，用于历史页展示最近观看时间。

## 验证
- 通过 `node --check electron\backend\emby.mjs`。
- 通过 `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`。
- 通过 `rg -n "[ \t]+$" electron\backend\emby.mjs src-tauri\src\emby\models.rs src\types\models.ts src\api\index.ts src\router\index.ts src\components\common\AppSidebar.vue src\views\HistoryView.vue docs\CURRENT_STATE.md docs\CHANGE_LOG\2026-05-29-0330-playback-history.md`，未发现行尾空白。
- 通过 `npm.cmd run build`，保留既有 PlayerView chunk 警告。
- 通过 `npm.cmd run electron:build`，Electron unpacked 产物保持在 `release-electron\win-unpacked\Hills Lite.exe`，保留既有 author/重复依赖/DEP0190 与 chunk 警告。
