# 2026-06-11 13:55 次字幕位置设置（reference parity）

## 背景
按 `docs/SETTINGS_REFERENCE_HILLSLITE.md`「真实剩余 · A 组」继续 1:1 复刻参考的「位置(次字幕)」。
精确镜像主字幕的 `position_pct` 链路，映射 mpv `--secondary-sub-pos`。

## 变更
### Rust
- `config/models.rs`：`AppSettings.subtitle_secondary_position_pct: u32`（默认 0=顶部，mpv 默认，不改现状）+ Default。
- `commands/settings.rs`：patch + 落盘（clamp 0–100）。
- `mpv/backend.rs`：`SubtitleStyle.secondary_position_pct: u32`。
- `mpv/ipc.rs` / `mpv/embedded.rs`：`SetSubtitleStyle` 应用 `secondary-sub-pos`。
- `commands/player.rs`（两处构造）+ `commands/subtitle.rs`（payload + From，clamp）。

### 前端
- `types/models.ts`：`AppSettings.subtitleSecondaryPositionPct` + `SubtitleStyleSettings.secondaryPositionPct`。
- `stores/settings.ts`、`platform/index.ts`：默认值 0。
- `components/player/SubtitlePanel.vue`：`SubtitleStylePatch` 联合类型 + 计算属性 +
  `stylePayload` + `resetSubtitleStyle` + 字幕样式区新增「次字幕位置」滑条（0–100%）。

### Electron
- `backend/store.mjs`：默认值 0。
- `main.mjs`：`subtitleStyleFrom` 补 `secondaryPositionPct`（clamp），`applySubtitleStyle` 注入 `secondary-sub-pos`。

## 验证
- `npm run build` 绿（gates / vue-tsc / vite 8.03s）。
- `cargo check --features mpv-embedded` 绿（29.5s）。
- `node --check` main.mjs 绿；ReadLints 无错误。

## 残余（A 组）
强制矩形字幕缩放、解码方式多档、记忆播放模式、电视直播直接播放、播放时隐藏主界面。
