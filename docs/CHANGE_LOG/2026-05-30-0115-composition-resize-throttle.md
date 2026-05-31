# 2026-05-30 01:15 Composition Resize 节流

## 目标

为后续启用内嵌 mpv / composition 渲染时的窗口尺寸变化做节流，避免 ResizeObserver 或窗口 resize 连续触发时高频调用后端 `embed_set_rect`。

## 变更

- `PlayerView.vue` 新增播放器 stage 引用，作为内嵌 mpv 子窗口的尺寸来源。
- 新增 `ResizeObserver` + `requestAnimationFrame` 调度，只在下一帧同步一次 `embedSetRect`。
- 同尺寸、同 DPR 的 rect 不再重复发送到后端。
- 全屏变化和窗口 resize 会共用同一条节流路径。
- 播放器卸载时会断开 observer、取消未执行的 rAF，并把 `embedSetVisible(false)` / `embedDetach()` 纳入并行清理任务。

## 验证

已通过：

```powershell
stageEl / ResizeObserver / scheduleEmbedRectSync / embedSetRect 落点检查
行尾空白检查
npm.cmd run build
npm.cmd run electron:build
```

说明：`npm.cmd run electron:build` 通过；Electron builder 仍输出既有 duplicate dependency references 和 Node DEP0190 提示。当前默认 `embedVideo` 仍为关闭，未做真实 WID/composition 内嵌窗口 resize 视觉实测。

## 当前状态

- 内嵌 mpv 的尺寸同步路径已经有 rAF 节流和重复 rect 去重。
- 默认播放器路径不受影响。
- 真正启用内嵌渲染时，仍需要在真实播放窗口里做 resize 视觉验证。
