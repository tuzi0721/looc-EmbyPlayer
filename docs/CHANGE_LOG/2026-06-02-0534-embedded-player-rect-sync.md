# 2026-06-02 05:34 - 内嵌播放控制层坐标闭环

## 变更

- Electron 内嵌 mpv 增加 `get_embed_state` 诊断命令，smoke 可以直接验证 `attach`、`rect`、`visible`、宿主 hwnd、mpv `wid` 和运行状态。
- Electron 开发环境优先使用 `src-tauri\target\release\electron_mpv_host.exe`，避免旧 debug helper 影响内嵌播放验收。
- PlayerView 在控制条显示/隐藏、鼠标唤醒和初始内嵌宿主显示后，会等待 Vue 布局稳定并重新同步 native mpv 宿主区域。
- 嵌入播放 smoke 改为以后端真实 embed state 验证窗口矩形，要求 native 视频区域避开顶部栏和底部控制条，避免盖住进度条、后退、播放、全屏等 Web 控件。

## 验证

- `node --check electron\main.mjs`
- `node --check scripts\smoke-electron-embedded-local.mjs`
- `npm.cmd run build`
- `node scripts\smoke-electron-embedded-local.mjs`

## 结果

- 嵌入播放 smoke `ok: true` / `functionalOk: true`。
- 初始播放 rect：`y=56,height=581`，避开顶部 56px 和底部控制区。
- compact resize rect：`y=44,height=431`，避开顶部 44px 和底部控制区。
- 本机解码合约仍通过，退出清理仍通过。
