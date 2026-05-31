# 2026-05-29 11:25 播放器重试防连点

## 目标

补完整播放器错误重试的交互状态，避免用户在失败浮层里连续点击“重试”触发多条并发播放启动。

## 变更

- 新增 `retryingPlayback` 状态。
- `retryPlayback()` 在已有重试进行中时直接返回。
- 重试按钮绑定 `GlassButton` 的 `loading` 状态，重试期间自动禁用并显示按钮内 loading。
- 重试完成、失败或成功后都会在 `finally` 中恢复可点击状态。

## 验证

已通过：

```powershell
rg -n "retryingPlayback" src\views\PlayerView.vue
rg -n "重试" src\views\PlayerView.vue
rg "[ \t]+$" src\views\PlayerView.vue
npm.cmd run build
npm.cmd run electron:build
```

说明：`npm.cmd run build` 与 `npm.cmd run electron:build` 均通过，PlayerView chunk 仍低于 500 kB；Electron builder 仍有已知的 package author、重复依赖和 Node DEP0190 提示。没有在真实播放失败浮层里连续点击“重试”做人手验证。

## 当前状态

- 播放器错误重试已具备 loading 与防连点。
- 播放器错误浮层现在包含重试、复制错误、返回三类动作。
- 真实失败场景下的按钮 loading 观感还需要后续人工确认。
