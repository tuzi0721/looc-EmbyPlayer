# 2026-06-02 07:20 Electron 可见播放兜底

## 背景
- 用户反馈点击播放后直接黑屏，且要求必须完成真实视检后才能认为通过。
- 复查发现 mpv 内部截图有画面，但桌面截图仍为纯黑，说明问题不在 Emby/Jellyfin 媒体链路或服务端转码，而在 Electron/Windows 的 `--wid` 原生窗口可见性组合。

## 改动
- Electron 播放页不再默认启用原生 mpv 嵌入窗口，改走 HTML video 的应用内直连播放路径；Tauri 仍保留原生 mpv 嵌入判断。
- 播放页启动时继续传递 `lineId` / `mediaSourceId`，保证从详情页选择的线路/媒体源不会在播放入口丢失。
- `scripts/smoke-electron-embedded-local.mjs` 改为同时识别 HTML video 与 mpv 两种播放状态，并把可见截图像素作为硬性通过条件。
- HTML video 视觉 smoke 使用 CDP 页面截图；原生 mpv 路径仍保留桌面截图与 mpv 内部截图对照。

## 验证
- `node --check scripts\smoke-electron-embedded-local.mjs`
- `node --check electron\main.mjs`
- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `npm.cmd run build`
- `cmd /c "set HILLS_SMOKE_KEEP_ARTIFACTS=1&& node scripts\smoke-electron-embedded-local.mjs"`

## 视检结果
- 人工打开并检查 `C:\Users\Sakur\AppData\Local\Temp\hills-lite-embedded-local-1780355997005\embedded-local.png`。
- 截图可见彩条视频画面、底部进度条和播放控件；像素检测 `brightRatio=1`、`colorfulRatio≈0.997`。
- 本阶段确认解决自动化样本中的“点击播放后纯黑屏”可见性问题；真实服务器长视频和含音频媒体仍需继续回归。
