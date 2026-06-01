# 2026-06-02 07:48 Electron unpacked 刷新

## 背景
- 本轮修复已经完成并通过视觉/播放 smoke，需要刷新用户实际启动的 Windows exe，避免继续打开旧产物看到旧问题。

## 构建
- 执行 `npm.cmd run electron:build`。
- 流程覆盖 `check:electron-commands`、`npm.cmd run build`、`build:electron-helper`、`electron-builder --win dir` 和 `check:electron-package`。

## 结果
- Electron package integrity ok。
- 最新 exe: `A:\vsc\emby-player\release-electron\win-unpacked\Hills Lite.exe`
- exe 时间: 2026-06-02 07:48:29
- helper: `A:\vsc\emby-player\release-electron\win-unpacked\resources\electron_mpv_host.exe`
- helper 时间: 2026-06-02 07:48:26
