# 2026-06-03 05:58 Tauri dev CDP timeout

## 背景
- 修复 `spawn npm.cmd` 后，重新执行真实 Tauri visual smoke。

## 本阶段尝试
- 模式：`HILLS_REAL_APP_MODE=tauri-dev`。
- 脚本已成功进入 `tauri-dev-launch`，并开始等待 WebView2 CDP target。

## 结果
- `getTargets()` 在 `http://127.0.0.1:<port>/json` 等待超时，报错：`CDP target timeout`。
- `netstat` 未看到该端口监听。
- 失败仍发生在进入页面自动化之前，未登录真实服务器、未播放真实媒体，不能作为播放器视检结果。

## 结论
- Tauri dev 启动分支已不再 `spawn EINVAL`，但 WebView2 remote debugging 未暴露出来。
- 下一步改用已构建好的 Tauri release exe 进行同一套真实 visual smoke，减少 `tauri dev` 的 Vite/Rust 启动复杂度。
