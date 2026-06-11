# 2026-06-11 15:10 显示封面评分设置（reference parity · B 组）

## 背景
按 `docs/SETTINGS_REFERENCE_HILLSLITE.md`「真实剩余 · B 组」复刻参考的「显示封面评分」：
在海报卡上显示社区评分（默认关，开启后显示）。

## 变更
### Rust
- `config/models.rs`：`AppSettings.show_cover_rating: bool`（默认 false）+ Default。
- `commands/settings.rs`：`SettingsPatch.show_cover_rating` + 落盘。

### 前端
- `types/models.ts`：`AppSettings.showCoverRating`。
- `stores/settings.ts`、`platform/index.ts`：默认 false。
- `components/common/PosterCard.vue`：引入 settings store + `rating` 计算属性
  （`showCoverRating && item.CommunityRating>0` 时取一位小数），左上角新增评分角标
  （星标 + 数值）+ 样式。
- `views/SettingsView.vue`：通用区「隐藏继续观看」下新增「显示封面评分」开关。

### Electron
- `backend/store.mjs`：默认 false。

## 验证
- `npm run build` 绿（gates / vue-tsc / vite 7.38s）。
- `cargo check --features mpv-embedded` 绿（25.3s）。
- `node --check` store.mjs 绿；ReadLints 无错误。

## 残余（B 组）
封面光泽暗角（需先加效果再给隐藏开关，低优）、封面缩放、图片质量、详情页背景策略、
媒体库启动落地页、搜索媒体标签、搜索历史。
