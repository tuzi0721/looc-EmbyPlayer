# 2026-06-03 06:01 Tauri release CDP timeout

## 背景
- Tauri dev 入口等待 WebView2 CDP 超时后，改用已构建好的 Tauri release exe，减少 `tauri dev` 启动链路干扰。

## 本阶段尝试
- 模式：`HILLS_REAL_APP_MODE=tauri-release`。
- 启动目标：`src-tauri\target\release\emby-player.exe`。
- 仍设置 WebView2 remote debugging 端口，并等待 `/json` target。

## 结果
- release exe 也在 CDP target 等待阶段超时：`CDP target timeout`。
- 失败仍发生在页面自动化前，未登录真实服务器、未播放真实媒体。

## 结论
- Tauri/WebView2 当前没有通过环境变量暴露 remote debugging；问题不在 `tauri dev` 的 npm 启动链路。
- 下一步检查本地 Tauri/Wry API，尝试在应用代码中显式配置 WebView2 additional browser args 或提供专用 visual-smoke 入口。
