# 2026-06-01 18:12 播放器全屏舞台铺满

## 目标
- 修正内嵌播放全屏像“伪全屏”的问题：控制栏显示时不应挤压 mpv 视频区域，视频舞台应始终铺满播放器窗口，全屏时铺满整个屏幕。

## 改动
- `src/views/PlayerView.vue`
  - 内嵌 mpv 矩形同步不再扣除顶部 / 底部控制栏高度，视频舞台始终跟随完整 `.player__stage`。
  - 控制栏继续作为覆盖层显示，不再改变底层视频窗口尺寸。
  - 新增 document fullscreen 状态同步，全屏按钮会在进入全屏后显示“退出全屏”图标和标题。
- `scripts/smoke-electron-embedded-local.mjs`
  - 全屏 smoke 新增 `stageCoversViewport` 断言，要求全屏后 `.player__stage` 覆盖整个 viewport。

## 验证
- 通过：`node --check scripts\smoke-electron-embedded-local.mjs`
- 通过：`npm.cmd run build`
- 通过：`node scripts\smoke-electron-embedded-local.mjs`
  - 全屏后窗口 / viewport 为 2560×1440，`.player__stage` 为 2560×1440，`stageCoversViewport: true`。
  - 后退从 10633ms 退到 866ms。
  - 缩放到 960×620 与 960×600 后无水平溢出，后退与全屏按钮可见。
  - 退出后 `electron_mpv_host.exe` 与随包 `mpv.exe` 均无残留。
- 通过：`npm.cmd run electron:build`

## 回滚
- 回退 `currentEmbedRect()` 的舞台矩形计算、全屏按钮状态同步，以及 smoke 中的 `stageCoversViewport` 检查即可。
