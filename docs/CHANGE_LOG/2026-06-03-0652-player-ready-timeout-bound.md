# 2026-06-03 06:52 Player ready timeout bound

## 背景
- 上一轮真实 smoke 在播放器 visual ready 阶段等待过久；虽然单次 mpv 状态调用已加 2.5 秒页面内超时，但外层仍有 100 次轮询，实际总等待过长。
- 已定向结束该轮卡住的 visual smoke 进程树（node、Tauri release、WebView2 子进程）。

## 本阶段修改
- `scripts/real-server-visual-smoke.mjs`
  - `waitForPlaybackVisualReady()` 从 100 次轮询收紧为 12 次。
  - `waitedMs` 改为真实经过时间。
  - 若 mpv 状态持续不可用，会在约 25-30 秒内返回 `ready:false` 与 `mpvStateTimedOut` 诊断。

## 验证
- `node --check scripts\real-server-visual-smoke.mjs`

## 结果
- 脚本语法通过。
- 下一步继续真实 visual smoke，避免播放器 ready 阶段长期挂起。
