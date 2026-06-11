# 2026-06-11 13:20 设置·播放器（视频输出驱动 / 最大缓存时长 / 低质量视频解码）

## 背景
按 `docs/SETTINGS_REFERENCE_HILLSLITE.md`「真实剩余 · A 组（mpv 直通）」继续 1:1 复刻，
本批取 3 个全新、注入即生效、默认不改变现有行为的 mpv 直通项。

## 变更
### Rust
- `config/models.rs`：新增枚举 `VideoOutputDriver`（gpu-next/gpu，默认 gpu-next，
  `mpv_value()` → `--vo` 值）；`AppSettings` 新增 `video_output_driver`、
  `mpv_cache_secs`（u32，0=mpv 默认）、`low_quality_decoding`（bool）+ Default。
- `commands/settings.rs`：`SettingsPatch` 三字段 + 落盘；引入 `VideoOutputDriver`。
- `mpv/ipc.rs` `spawn_mpv_ipc`：注入 `--vo=<driver>`；`low_quality_decoding` 时注入
  `--vd-lavc-fast=yes --vd-lavc-skiploopfilter=all`；`mpv_cache_secs>0` 时注入
  `--cache=yes --cache-secs=<n>`。

### 前端
- `types/models.ts`：`AppSettings` 加 `videoOutputDriver: "gpu-next"|"gpu"`、
  `mpvCacheSecs:number`、`lowQualityDecoding:boolean`。
- `stores/settings.ts` 与 `platform/index.ts`：两处默认值补齐（gpu-next / 0 / false）。
- `views/SettingsView.vue` 播放器面板：视频输出驱动（seg）、低质量视频解码（开关）、
  最大缓存时长（GlassInput，秒）。

### Electron
- `backend/store.mjs`：三项默认值。
- `backend/mpv.mjs`：注入 `--cache-secs` 与低质量解码参数；`--vo` 仍由 d3d11 内嵌路径
  固定（videoOutputDriver 仅驱动 Tauri/IPC 后端，避免破坏 Electron 内嵌合成）。

## 验证
- `npm run build` 绿（check:local-decode 157 / check:no-planned-ui 79 / vue-tsc / vite 6.57s）。
- `cargo check --features mpv-embedded` 绿（50s）。
- `node --check` mpv.mjs / store.mjs 绿；ReadLints 无错误。
- 行为待真机：切 vo=gpu / 开低质量解码 / 设缓存时长=300 → 下次起播 mpv 参数生效。

## 残余
- 自研播放器（standalone argv）尚未注入这三项（与 06-10 既有 alang/slang/stereo「下批」
  残余一致；player argv 解析对未知 --k=v 会转发 libmpv，后续在 standalone build_args 接）。
- A 组其余项（解码方式多档、强制矩形字幕缩放、字幕粗体/次字幕位置、恢复默认字幕样式、
  记忆播放模式、电视直播直接播放、播放时隐藏主界面）待续。
- 未提交/推送（等用户指示）。
