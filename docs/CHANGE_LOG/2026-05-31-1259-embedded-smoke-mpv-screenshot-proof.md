# 内嵌播放黑屏诊断对照

## 背景

Electron 内嵌 mpv 冒烟测试中，mpv 状态显示已播放且有轨道/时长，但屏幕截图仍接近全黑，需要确认是 mpv 未渲染还是窗口合成层没有露出视频。

## 结果

- `scripts/smoke-electron-embedded-local.mjs` 新增 mpv 自身截图对照，会在播放期间调用 `take_screenshot` 并分析 PNG 像素。
- 普通宿主窗口模式下，mpv 自身截图 `brightRatio = 1`、`colorfulRatio = 1`，屏幕截图 `brightRatio = 0.0074`、`colorfulRatio = 0.00046`。
- 临时置顶宿主窗口模式下，mpv 自身截图仍为彩色，屏幕截图仍接近全黑。
- 结论：播放、解码和 mpv 帧输出正常；黑屏集中在 Electron/Win32 宿主窗口合成层，不是简单 z-order 或 mpv 播放源问题。

## 下一步

继续改内嵌实现方案，优先尝试由 Electron 管理一个跟随主窗口的无边框播放宿主窗口，让 mpv 显示在播放器 stage 区域。
