# 2026-06-03 05:51 Tauri smoke spawn EINVAL

## 背景
- 2026-06-03 重新尝试真实 Tauri/native visual smoke，GUI/网络权限已经通过，不再是 2026-06-02 的审批 429 阻塞。

## 本阶段尝试
- 使用真实账号环境变量启动 `scripts/real-server-visual-smoke.mjs`。
- 目标模式：`HILLS_REAL_APP_MODE=tauri-dev`。
- 脚本读取输入成功，并进入 `tauri-dev-launch`。

## 结果
- 脚本在启动 Tauri dev 子进程时失败：`Error: spawn EINVAL`。
- 失败发生在应用启动前，未进入 WebView2、未登录真实服务器、未播放真实媒体，因此不能作为播放器视检结果。

## 结论
- 当前阻塞点已从权限层转为 smoke 脚本启动方式问题。
- 下一步修复 Tauri dev 启动分支，然后立即重新执行真实 visual smoke。
