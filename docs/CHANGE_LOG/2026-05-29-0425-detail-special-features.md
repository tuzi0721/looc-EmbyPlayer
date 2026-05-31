# 2026-05-29 04:25 - 详情页附加内容

## 本段目标
- 在详情页接入 Emby/Jellyfin 的 Special Features / Extras 数据，让电影、剧集等条目可以展示预告片、幕后、删减片段等附加视频。

## 变更
- 前端 API 新增 `api.specialFeatures`，统一通过 `special_features` 命令获取附加内容列表。
- Electron 后端新增 `specialFeatures`，请求 `Users/{userId}/Items/{itemId}/SpecialFeatures`，并让列表响应规范化同时兼容数组返回与 `ItemsResponse` 返回。
- Tauri 后端新增 `special_features` 命令、endpoint 与 client 方法，兼容特殊内容接口返回数组的 Jellyfin/Emby 形态。
- 详情页新增“附加内容”横滑区，使用 16:9 卡片展示附加视频，点击后直接进入播放。

## 验证
- 初轮 `node --check electron\backend\emby.mjs` 通过。
- 初轮 `node --check electron\main.mjs` 通过。
- 初轮 `cargo check --manifest-path src-tauri\Cargo.toml --all-targets` 通过。
- 初轮 `npm.cmd run build` 通过。
- `rg -n "[ \t]+$" src\api\index.ts electron\backend\emby.mjs electron\main.mjs src-tauri\src\emby\endpoints.rs src-tauri\src\emby\client.rs src-tauri\src\commands\media.rs src-tauri\src\lib.rs src\views\DetailView.vue docs\CURRENT_STATE.md docs\CHANGE_LOG\2026-05-29-0425-detail-special-features.md` 无输出。
- `npm.cmd run electron:build` 通过；仍仅有既有 PlayerView chunk 体积、electron-builder author/duplicate dependency、DEP0190 警告。
