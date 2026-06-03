# 2026-06-03 07:18 Tauri embedded state fixes

## 背景
- 真实 Tauri visual smoke 已证明播放器进入真实 `/player/...` 路由后，`get_state` 持续超时并拖死后续 fullscreen 诊断。
- 用户指出 mpv 内嵌比例与分布不对，播放区域不应被控件挤压。

## 本阶段修改
- `src/views/PlayerView.vue`
  - Tauri/Electron 嵌入模式下，mpv 原生窗口矩形改为铺满 `.player__stage`。
  - 顶部/底部控制栏只作为覆盖层，不再参与视频窗口高度扣减。
- `src-tauri/src/mpv/embedded.rs`
  - 为 libmpv embedded backend 增加独立 event-drain client/thread，持续读取 mpv event queue。
  - 避免真实播放时事件队列不被消费导致属性读取或命令链路卡住。
- `src-tauri/src/commands/player.rs`
  - Tauri `play` 从仅返回 `playSessionId` 字符串改为返回完整 `PlaybackSourceResult`。
  - 返回当前播放源、媒体源候选、线路候选、headers、userAgent 和本机解码诊断。
  - `get_playback_source` 返回 headers 时补齐线路自定义 headers。

## 验证
- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `node --check scripts\real-server-visual-smoke.mjs`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## 结果
- Rust check 通过。
- 下一步刷新前端/release 构建，并用真实账号重跑 visual smoke。
