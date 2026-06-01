# 2026-06-02 05:03 - Electron unpacked 产物刷新
## 变更

- 重新执行 `npm.cmd run electron:build`，刷新 `release-electron\win-unpacked\Hills Lite.exe`，确保今天已提交的首页、自适应、个人媒体图片回退和内嵌播放器控制修复进入可执行产物。
- 打包流程重新构建前端生产资源和 release 版 `electron_mpv_host.exe`。
- `check:electron-package` 确认 `app.asar`、随包 mpv 资源和 `electron_mpv_host.exe` 均已复制到 `win-unpacked`。

## 产物

- `A:\vsc\emby-player\release-electron\win-unpacked\Hills Lite.exe`
- exe 时间：2026-06-02 05:02:30
- `app.asar` 时间：2026-06-02 05:02:30
- `electron_mpv_host.exe` 时间：2026-06-02 05:02:28

## 验证

- `npm.cmd run electron:build`
- `check:electron-package` 随打包脚本通过
