# 2026-06-02 17:15 Player native video evidence

## 背景
- 人工复核上一轮 `player-initial.png` 后确认旧证据不合格：截图中的可见画面可能是页面内 2:3 `player__poster-card` 海报兜底，不是 mpv 的真实视频层。
- 因此“有像素”不能再等同于“真实播放通过”；必须证明画面来自当前 Electron 进程树里的 mpv/native 窗口，并且可见画面比例接近视频参数。

## 本阶段变更
- 嵌入 mpv 模式下不再渲染竖版 `player__poster-card`，避免海报卡冒充播放画面；HTML video 模式仍保留加载前海报兜底。
- Electron mpv 启动参数显式加入 `--keepaspect=yes`、`--panscan=0`、`--video-zoom=0`、`--video-scale-x=1`、`--video-scale-y=1`，让首帧默认保持原始比例。
- 真实服务器 visual smoke 改为：
  - 页面截图只作为 UI 层证据；
  - mpv 播放时必须从当前 Electron 进程树抓取 native/mpv 窗口；
  - 若 native/mpv 取证失败，不再退回页面截图当播放证据；
  - 记录截图内容边界比例，并与 `htmlVideo` 或 `mpv videoParams` 的显示比例做断言；
  - 播放器缩放后的 1366x768 / 960x600 / 760x430 截图同样走 native/mpv 层取证和比例检查。

## 验证
- `node --check scripts\real-server-visual-smoke.mjs`
- `node --check electron\backend\mpv.mjs`
- `npm.cmd run build`
- `node --check scripts\smoke-electron-embedded-local.mjs`
- `node scripts\smoke-electron-embedded-local.mjs`
  - 本地 smoke 输出 `ok: true`。
  - UI 层截图不再含竖版海报假画面。
  - 本地 native/mpv 样本来自 `mpv.exe` 窗口，后退、全屏、缩放和退出清理仍通过。

## 下一步
- 立刻用真实账号重跑真实服务器多尺寸 visual smoke。
- 人工复核真实 `player-*.png` 与 native/mpv 截图，确认不再把海报或暗场误判为真实播放通过。
