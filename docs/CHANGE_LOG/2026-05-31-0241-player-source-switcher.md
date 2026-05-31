# 2026-05-31 02:41 播放器线路与媒体源切换入口

## 目标

把上一小段暴露出的线路 / 媒体源候选接到播放器真实 UI，让用户能在播放会话内切换备用线路或 `PlaybackInfo.MediaSources`，并从当前播放位置继续开流。

## 变更

- `player` store 保存 Electron `play` 返回的 `PlaybackSource`，包括当前线路、候选线路和候选媒体源。
- 播放器底栏在存在多个候选时显示“播放源”图标入口，面板分为“播放线路”和“媒体源”两组。
- 切换线路或媒体源时会按当前播放位置重新发起 `player.play({ lineId, mediaSourceId })`，并在切换前 best-effort 上报旧会话停止进度。
- 设置菜单补充“播放源”入口，窄窗口隐藏底栏播放源图标时仍可从设置面板进入。
- 播放源面板补充候选摘要，显示线路健康/延迟，以及媒体源分辨率、codec、容器、码率和大小等 `PlaybackInfo` 信息。

## 验证

已通过：

```powershell
npm.cmd run build
```

结果：`vue-tsc --noEmit` 与 Vite production build 均通过，播放器模板和类型检查通过。

## 当前状态

- 播放器 UI 已能展示并切换真实播放线路 / 媒体源候选。
- 尚未做真实账号下的 Electron 启动、登录和播放切换人工验收，下一小段进入完整验证。
