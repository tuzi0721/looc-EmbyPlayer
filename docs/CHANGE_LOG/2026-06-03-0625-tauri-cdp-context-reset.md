# 2026-06-03 06:25 Tauri CDP context reset

## 背景
- 已将 mpv 运行期 DLL 复制到 Tauri release exe 同级目录，并刷新 release exe。

## 本阶段执行
- 使用 2026-06-03 06:24:14 的 `src-tauri\target\release\emby-player.exe` 重跑真实 visual smoke。

## 结果
- loader failure 已消失。
- WebView2 CDP 已进入：
  - `cdp-targets-ready`
  - `cdp-connect`
  - `setup-start`
- 随后失败于启动期页面上下文重置：
  - `Runtime.evaluate: Execution context was destroyed.`

## 结论
- 当前已越过 DLL 启动失败和 CDP target timeout；失败点推进到页面自动化阶段。
- 该阶段仍未登录真实服务器、未播放真实媒体，不能作为播放器视检结果。
- 下一步把 `setup-start` 的首次大段 `Runtime.evaluate` 改为已有的 context-reset 重试 helper。
