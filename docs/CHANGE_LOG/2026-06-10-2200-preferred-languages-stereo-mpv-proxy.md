# 2026-06-10 22:00 设置·播放器（首选音频/字幕语言、强制立体声）+ mpv 代理透传

## 背景
按参考截图（`SETTINGS_REFERENCE_HILLSLITE.md`·播放器）继续 1:1 复刻：
首选音频语言、首选字幕语言、强制输出立体声；并补上批残余——自定义代理透传 mpv。

## 变更
- Rust `config/models.rs`：`preferred_audio_language / preferred_subtitle_language`
  （mpv `--alang/--slang` ISO 639 列表，空=服务器默认）、`force_stereo_audio`。
- Rust `commands/settings.rs`：三项 patch 落盘。
- Rust `mpv/ipc.rs` `spawn_mpv_ipc`：注入 `--alang/--slang/--audio-channels=stereo`；
  `network_proxy_mode=custom` 时注入 `--http-proxy=<url>`（直连 URL 场景生效；
  本地 stream_proxy 场景上游代理已由 reqwest 层处理）。
- 前端：TS 类型 + 三处默认值 + Electron store；`SettingsView` 播放器面板新增
  首选音频/字幕语言五段选择（默认/中文/日语/英语/韩语 → `zh,zho,chi` 等列表）
  与强制立体声开关（标注下次播放生效）。

## 验证
- `npm run build` 绿（7.13s）；`cargo check --features mpv-embedded` 绿（22.9s）；
  `node --check` store.mjs 绿；无 lint。
- 行为待真机：选「日语」→ 下次起播 mpv 自动选日音轨；强制立体声 → 多声道源降混。

## 残余
- standalone（自研播放器路径）`build_args` 的 alang/slang/stereo/proxy 同步注入（下批）。
- 首选次字幕语言（参考有）待次字幕语言偏好设计。
