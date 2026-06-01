# 2026-06-02 04:56 - 收藏历史卡片父级图片回退
## 变更

- `PosterCard` 的取图候选扩展到 `Thumb`，横向卡片现在按自身 Backdrop、父级/系列 Backdrop、父级 Thumb、自身 Primary、父级/系列 Primary 逐级回退。
- Emby/Jellyfin 的父级/系列图片字段贯穿 Electron 后端、Web 兼容平台、Tauri 兼容模型和前端类型，包括 `ParentThumbItemId`、`ParentThumbImageTag`、`ParentBackdropItemId`、`ParentBackdropImageTags`、`SeriesPrimaryImageTag` 等。
- 个人收藏、播放历史、聚合视界、首页候选、搜索和详情相关列表请求都追加父级图片字段，并把 `EnableImageTypes` 扩展为 `Primary,Backdrop,Thumb`。
- 首页 smoke 的假单集改为自身无 Primary/Backdrop、只能通过父级 Thumb 加载，确保收藏/历史/聚合图片回退是真实生效。

## 验证

- `node --check electron\backend\emby.mjs`
- `node --check electron\main.mjs`
- `node --check scripts\smoke-electron-home-hero.mjs`
- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `npm.cmd run build`
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- `node scripts\smoke-electron-home-hero.mjs`
- `git diff --check`

## 备注

- Codex in-app Browser 可打开 `http://127.0.0.1:1420/history` 且无错误态，但当前 Browser 会话没有个人媒体测试数据；本阶段真实图片加载验收以 Electron smoke 为准。
