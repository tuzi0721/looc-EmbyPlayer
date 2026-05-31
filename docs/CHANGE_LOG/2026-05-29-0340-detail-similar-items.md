# 2026-05-29 03:40 - 详情页相似内容

## 本段目标
- 补齐 PDP 路线中的相似内容推荐，让详情页可以继续发现同类电影、剧集或单集。

## 变更
- 新增 `similar_items` 命令，Electron 与 Tauri 后端都接入 Emby/Jellyfin `Items/{itemId}/Similar`，并请求图片比例、年份、用户数据与剧集信息字段。
- `api.similarItems` 统一前端调用入口，详情页加载主体媒体后异步拉取相似内容，不阻塞主详情显示。
- 详情页底部新增“相似内容”横滑区，展示海报、类型、年份或剧集季集信息，点击可进入对应详情页；加载失败时静默隐藏，避免影响 PDP 主流程。

## 验证
- 通过 `node --check electron\backend\emby.mjs`。
- 通过 `node --check electron\main.mjs`。
- 通过 `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`。
- 通过 `rg -n "[ \t]+$" electron\backend\emby.mjs electron\main.mjs src-tauri\src\emby\client.rs src-tauri\src\commands\media.rs src-tauri\src\lib.rs src\api\index.ts src\views\DetailView.vue docs\CURRENT_STATE.md docs\CHANGE_LOG\2026-05-29-0340-detail-similar-items.md`，未发现行尾空白。
- 通过 `npm.cmd run build`，保留既有 PlayerView chunk 警告。
- 通过 `npm.cmd run electron:build`，Electron unpacked 产物保持在 `release-electron\win-unpacked\Hills Lite.exe`，保留既有 author/重复依赖/DEP0190 与 chunk 警告。
