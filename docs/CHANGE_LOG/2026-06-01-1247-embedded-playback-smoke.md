# 内嵌播放 smoke 加固

- **动机**：播放窗口内嵌已经有本地彩色视频 smoke，但用户实际关心的不只是非黑屏，还包括控制栏、全屏和窗口 resize 后的嵌入层同步。
- **改动**：
  - `scripts/smoke-electron-embedded-local.mjs` — 在既有 Electron 本地假 Emby + 彩色视频 smoke 中新增播放器 UI 几何检查，确认顶部/底部控制栏、播放按钮和全屏按钮可见。
  - `scripts/smoke-electron-embedded-local.mjs` — 自动点击全屏按钮并确认进入全屏，再退出全屏后触发窗口缩放到 960×620。
  - `scripts/smoke-electron-embedded-local.mjs` — resize 后重新读取播放器舞台尺寸、检查无横向溢出，并对缩放后窗口截图做彩色视频像素检测。
  - `docs/CURRENT_STATE.md` — 记录内嵌播放 smoke 已覆盖控制栏、全屏和 resize。
- **验证**：
  - 通过：`node --check scripts\smoke-electron-embedded-local.mjs`
  - 通过：`node scripts\smoke-electron-embedded-local.mjs`
  - 通过：`npm.cmd run build`
  - 通过：`git diff --check`
- **结果**：通过；内嵌播放 smoke 现在会在本地自动覆盖非黑屏、控制栏、长按倍速、全屏进入/退出和窗口 resize 后的像素检测。
- **风险**：该 smoke 仍使用本地假 Emby 和临时彩色视频，不替代真实服务器媒体的人工长时间播放体验检查。
