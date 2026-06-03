# 2026-06-03 06:27 Tauri playback source command

## 背景
- 真实 visual smoke 已进入 Tauri/WebView2 setup，但前端调用 `api.getPlaybackSource()` 时 Tauri 后端返回 `Command get_playback_source not found`。
- 这不是单纯测试脚本问题；Tauri 前端 API 与后端 command 注册确实缺口。

## 本阶段修改
- `src-tauri/src/commands/player.rs`
  - 新增 `get_playback_source` Tauri command。
  - 该 command 只解析 PlaybackInfo、选择本机 DirectPlay/DirectStream 媒体源、生成静态直连 streamUrl、返回媒体源列表/线路列表/tracks/headers/userAgent/diagnostics，不启动 mpv。
  - 继续沿用本机解码约束：只接受 `supportsDirectPlay` 或 `supportsDirectStream` 的媒体源，不允许服务端转码。
- `src-tauri/src/lib.rs`
  - 注册 `commands::player::get_playback_source`。

## 验证
- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## 结果
- 新 command 编译通过。
- 下一步刷新 Tauri release exe 并重跑真实 visual smoke，确认 setup 能获取真实 PlaybackInfo。
