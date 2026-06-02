# 2026-06-02 17:34 Electron unpacked aspect refresh

## 背景
- 真实账号播放器比例和 native/mpv 取证通过后，需要刷新 Windows unpacked 产物，避免用户拿到旧 exe。

## 变更
- 重新执行 `npm.cmd run electron:build`。
- 构建包含 Electron 命令覆盖检查、本机解码 guard、no-planned-ui、Vue 类型检查、Vite 生产构建、`electron_mpv_host` release build、`electron-builder --win dir` 和包完整性检查。

## 验证
- `Electron command coverage ok: 104 renderer commands, 105 Electron handlers, 0 explicit no-op commands.`
- `Local decode guard ok: 151 source files scanned.`
- `No planned UI check ok: 77 source files scanned.`
- Vite production build passed.
- `electron_mpv_host` release build passed.
- `Electron package integrity ok: 6 bundled mpv files copied ... electron mpv host helper copied, app.asar present.`

## 产物
- `A:\vsc\emby-player\release-electron\win-unpacked\Hills Lite.exe`
  - 时间：2026-06-02 17:34:24
  - 大小：210150400 bytes
- `A:\vsc\emby-player\release-electron\win-unpacked\resources\electron_mpv_host.exe`
  - 时间：2026-06-02 17:34:21
  - 大小：309760 bytes

## 下一步
- 提交并推送本阶段修复、真实视检日志和最新构建状态。
