# 2026-05-29 14:55 播放器卸载并行清理

## 目标

关闭播放器或离开播放页时，将互不依赖的桌面状态恢复和播放停止并行执行，减少某个桌面命令拖慢整体清理的概率。

## 变更

- `PlayerView.vue` 的 `onBeforeUnmount` 中新增 `cleanupTasks`。
- 窗口置顶恢复、副屏遮黑关闭和 `player.stop()` 现在一起发起，并通过 `Promise.allSettled` 统一等待。
- HTML5/HLS fallback 的进度上报和本地销毁仍保持同步执行，避免视频元素、HLS 实例和定时器残留。

## 验证

已通过：

```powershell
PlayerView cleanupTasks / Promise.allSettled 落点检查
行尾空白检查
npm.cmd run build
npm.cmd run electron:build
```

说明：`npm.cmd run electron:build` 通过；Electron builder 仍输出既有 duplicate dependency references 和 Node DEP0190 提示。未做真实播放窗口关闭时的人工耗时对比。

## 当前状态

- 播放页卸载时的独立清理任务已并行化。
- 离开播放器时仍会停止播放、清理 Now Playing、恢复置顶和关闭副屏遮黑。
- 播放器返回按钮仍保持 fire-and-forget stop 与立即路由返回。
