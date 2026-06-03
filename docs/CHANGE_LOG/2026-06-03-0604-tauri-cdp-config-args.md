# 2026-06-03 06:04 Tauri CDP config args

## 背景
- Tauri dev 与 release 真实 visual smoke 都卡在 WebView2 CDP target 等待阶段。
- 本地 Tauri/Wry 源码确认 `WindowConfig.additional_browser_args` 会传给 WebView2。

## 本阶段修改
- `src-tauri/src/lib.rs` 在 `tauri::run` 前生成可变 context，并仅在 Windows 且存在 `HILLS_TAURI_CDP_PORT` 时，为所有 Tauri 窗口注入 WebView2 browser args。
- 注入内容保留 Wry 默认禁用项和 autoplay 策略，并追加 `--remote-debugging-port=<port>`。
- `scripts/real-server-visual-smoke.mjs` 的 `tauri-dev` 与 `tauri-release` 分支同步传入 `HILLS_TAURI_CDP_PORT`，保留原 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 作为兼容兜底。

## 验证
- `node --check scripts\real-server-visual-smoke.mjs`
- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## 结果
- Tauri embedded feature 编译通过，说明 CDP 注入入口可构建。
- 该阶段仍未声明真实播放视检通过；下一步立即重跑真实账号 Tauri release visual smoke，确认是否能进入 WebView2、登录真实服务器并播放真实媒体。
