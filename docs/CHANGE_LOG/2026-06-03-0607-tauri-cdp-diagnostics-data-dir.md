# 2026-06-03 06:07 Tauri CDP diagnostics and data dir

## 背景
- 新 release exe 仍在 CDP target 等待阶段超时，且早期失败没有足够诊断信息。
- Wry 注释说明：不同 browser args 的 WebView2 实例应使用不同 data directory，否则可能复用旧环境。

## 本阶段修改
- `scripts/real-server-visual-smoke.mjs`
  - 新增本轮独立 `webview2-data` 目录。
  - Tauri dev/release 启动时传入 `HILLS_TAURI_WEBVIEW_DATA_DIR` 与 `WEBVIEW2_USER_DATA_FOLDER`。
  - CDP timeout 也会输出 `cdp-targets-failed` 阶段，包含子进程状态、端口监听摘要、stdout/stderr、临时目录、app 端 visual-smoke 日志和 crash log 尾部。
- `src-tauri/src/lib.rs`
  - `HILLS_TAURI_CDP_PORT` 启用时同步把窗口 `data_directory` 指向 `HILLS_TAURI_WEBVIEW_DATA_DIR`。
  - 写入 `visual-smoke.log`，用于确认 app 端是否执行了 CDP/data-dir 配置。

## 验证
- `node --check scripts\real-server-visual-smoke.mjs`
- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## 结果
- 诊断与独立 data directory 改动编译通过。
- 下一步刷新 Tauri release exe 并重跑真实 visual smoke。
