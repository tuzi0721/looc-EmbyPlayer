# 2026-06-02 05:17 - Electron unpacked 产物再次刷新
## 变更

- 重新执行 `npm.cmd run electron:build`，把首页巨幕 Logo / 父级图回退修复写入 `release-electron\win-unpacked`。
- 打包流程重新构建前端生产资源和 release 版 `electron_mpv_host.exe`。
- `check:electron-package` 确认 `app.asar`、随包 mpv 资源和 `electron_mpv_host.exe` 均已复制到 `win-unpacked`。

## 产物

- `A:\vsc\emby-player\release-electron\win-unpacked\Hills Lite.exe`
- exe 时间：2026-06-02 05:16:59
- `app.asar` 时间：2026-06-02 05:16:58
- `electron_mpv_host.exe` 时间：2026-06-02 05:16:56

## 验证

- `npm.cmd run electron:build`
- `check:electron-package` 随打包脚本通过
