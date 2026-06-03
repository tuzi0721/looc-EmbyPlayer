# 2026-06-03 06:06 Tauri release CDP still timeout

## 背景
- 已刷新包含 `HILLS_TAURI_CDP_PORT` 注入逻辑的新 Tauri/native release exe。
- 本阶段用真实账号 visual smoke 入口启动该 exe，目标是进入 WebView2 CDP 后继续真实服务器登录与播放视检。

## 本阶段执行
- 模式：`HILLS_REAL_APP_MODE=tauri-release`。
- 启动目标：`src-tauri\target\release\emby-player.exe`。
- 脚本已传入 `HILLS_TAURI_CDP_PORT` 与 WebView2 remote debugging 参数。

## 结果
- 仍失败于 `CDP target timeout`。
- `netstat` 未看到本轮 remote debugging 端口监听。
- 失败发生在页面自动化前，未登录真实服务器、未播放真实媒体、未产生播放器视觉结果。

## 结论
- 仅给 release exe 注入 `additional_browser_args` 还不足以让脚本连接 WebView2 CDP。
- 下一步补早期失败诊断：在 CDP timeout 前后输出子进程退出状态、stdout/stderr、临时目录和端口监听摘要，再据此判断是应用启动失败、WebView2 参数未生效，还是需要换专用测试入口。
