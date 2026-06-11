# 2026-06-11 14:05 解码方式多档（硬解方式）设置（reference parity）

## 背景
按 `docs/SETTINGS_REFERENCE_HILLSLITE.md`「真实剩余 · A 组」复刻参考的「解码方式」。
采用**纯增量、不破坏现有行为**的设计：保留现有「硬件解码 开/关」总开关（standalone 路径仍读
`hardware_decoding`），新增 `hwdec_mode` 枚举作为「硬解方式」，仅在硬解开启时决定 mpv `--hwdec` 档位。

## 变更
### Rust
- `config/models.rs`：新增 `HwdecMode` 枚举（auto/d3d11va/vulkan/copy，默认 auto，
  `mpv_value()`：auto→auto-safe、copy→auto-copy）；`AppSettings.hwdec_mode` + Default。
- `commands/settings.rs`：`SettingsPatch.hwdec_mode` + 落盘；引入 `HwdecMode`。
- `mpv/ipc.rs`：硬解开启时 `--hwdec=<hwdec_mode>`（原固定 auto-safe → 按档位）。

### 前端
- `types/models.ts`：`AppSettings.hwdecMode: "auto"|"d3d11va"|"vulkan"|"copy"`。
- `stores/settings.ts`、`platform/index.ts`：默认 "auto"。
- `views/SettingsView.vue`：播放器面板「硬件解码」开关下方新增「硬解方式」四段选择
  （仅当硬件解码开启时显示）。

### Electron
- `backend/store.mjs`：默认 "auto"。
- `backend/mpv.mjs`：硬解开启时按 `hwdecMode` 映射 `--hwdec`（env override 优先级不变）。

## 验证
- `npm run build` 绿（gates / vue-tsc / vite 6.56s）。
- `cargo check --features mpv-embedded` 绿（29.3s）。
- `node --check` mpv.mjs / store.mjs 绿；ReadLints 无错误。

## 残余（A 组）
强制矩形字幕缩放（mpv 映射待确认）、记忆播放模式、电视直播直接播放、播放时隐藏主界面（均为 app 行为，需设计）。
