# 2026-06-11 13:45 字幕粗体设置（reference parity）

## 背景
按 `docs/SETTINGS_REFERENCE_HILLSLITE.md`「真实剩余 · A 组」继续 1:1 复刻参考的「字幕粗体」。
核对发现「恢复默认字幕样式」其实早已实现（播放器字幕面板的「默认」按钮 `resetSubtitleStyle`），
故本批只补字幕粗体。

## 变更（精确镜像既有 force_style 链路）
### Rust
- `config/models.rs`：`AppSettings.subtitle_bold: bool`（默认 false）+ Default。
- `commands/settings.rs`：`SettingsPatch.subtitle_bold` + 落盘。
- `mpv/backend.rs`：`SubtitleStyle.bold: bool`。
- `mpv/ipc.rs` / `mpv/embedded.rs`：`SetSubtitleStyle` 应用 `sub-bold`。
- `commands/player.rs`（两处构造）+ `commands/subtitle.rs`（`SubtitleStylePayload` + `From`）。

### 前端
- `types/models.ts`：`AppSettings.subtitleBold` + `SubtitleStyleSettings.bold`。
- `stores/settings.ts`、`platform/index.ts`：默认值。
- `components/player/SubtitlePanel.vue`：`SubtitleStylePatch` 联合类型 + `stylePayload` +
  `resetSubtitleStyle` + 字幕样式区新增「字幕粗体」开关。

### Electron
- `backend/store.mjs`：默认值。
- `main.mjs`：`subtitleStyleFrom` 补 `bold`，`applySubtitleStyle` 注入 `sub-bold`。

## 验证
- `npm run build` 绿（check:local-decode / check:no-planned-ui / vue-tsc / vite 6.37s）。
- `cargo check --features mpv-embedded` 绿（25.8s）。
- `node --check` main.mjs / store.mjs 绿；ReadLints 无错误。
- 行为待真机：开「字幕粗体」→ 字幕面板即时 set sub-bold，下次播放保留。

## 残余（A 组）
强制矩形字幕缩放、解码方式多档、次字幕位置、记忆播放模式、电视直播直接播放、播放时隐藏主界面。
