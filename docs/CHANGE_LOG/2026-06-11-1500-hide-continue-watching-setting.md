# 2026-06-11 15:00 隐藏继续观看设置（reference parity · B 组开端）

## 背景
按 `docs/SETTINGS_REFERENCE_HILLSLITE.md`「真实剩余 · B 组（首页/媒体库 UI 区块开关）」
复刻参考的「隐藏继续观看」。这是 B 组里最自包含的一项（单区块门控）。

## 变更
### Rust
- `config/models.rs`：`AppSettings.hide_continue_watching: bool`（默认 false）+ Default。
- `commands/settings.rs`：`SettingsPatch.hide_continue_watching` + 落盘。

### 前端
- `types/models.ts`：`AppSettings.hideContinueWatching`。
- `stores/settings.ts`、`platform/index.ts`：默认 false。
- `views/HomeView.vue`：继续观看区块 `v-if` 增加 `&& !settings.settings.hideContinueWatching`。
- `views/SettingsView.vue`：通用区新增「隐藏继续观看」开关。

### Electron
- `backend/store.mjs`：默认 false。

## 验证
- `npm run build` 绿（gates / vue-tsc / vite 7.36s）。
- `cargo check --features mpv-embedded` 绿（25.3s）。
- `node --check` store.mjs 绿；ReadLints 无错误。

## 说明 / 残余（B 组）
- 「每日推荐 / 每日推荐过滤」我们首页无对应区块（参考有我们无），标 N/A。
- B 组仍缺：封面光泽暗角、显示封面评分、封面缩放、图片质量、详情页背景策略、
  媒体库启动落地页、搜索包含媒体数据、搜索历史开关（分散在 PosterCard/DetailView/SearchView）。
