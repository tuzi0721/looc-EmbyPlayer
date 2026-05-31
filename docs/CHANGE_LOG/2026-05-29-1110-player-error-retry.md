# 2026-05-29 11:10 播放器错误重试

## 目标

播放启动失败后，用户不必先返回详情页再重新进入播放器，可以直接在错误浮层里重试当前播放请求。

## 变更

- 将播放器首次进入时的启动逻辑抽成 `startCurrentPlayback()`，供挂载和重试共同复用。
- 错误浮层新增“重试”按钮。
- 重试时会清空当前错误、清空错误复制状态、关闭临时播放器面板，并重新按当前路由参数启动播放。
- 重试仍复用原有本地播放、HTML fallback 与 mpv 播放分支，并在启动后继续套用当前画面模式。
- 错误复制状态清理改为复用 `clearErrorCopyStatus()`，卸载播放器时也通过该函数清理计时器。

## 验证

已通过：

```powershell
rg -n "startCurrentPlayback|retryPlayback|clearErrorCopyStatus|重试|复制错误|await startCurrentPlayback" src\views\PlayerView.vue
rg "[ \t]+$" src\views\PlayerView.vue
npm.cmd run build
npm.cmd run electron:build
```

说明：`npm.cmd run build` 与 `npm.cmd run electron:build` 均通过，本轮构建中 PlayerView chunk 已低于 500 kB，未再出现 chunk 体积提示；Electron builder 仍有已知的 package author、重复依赖和 Node DEP0190 提示。没有在真实播放失败场景里人工点击“重试”验证恢复效果。

## 当前状态

- 播放器错误浮层支持“重试 / 复制错误 / 返回”三种动作。
- 重试逻辑与首次启动播放共用同一函数，避免两套入口漂移。
- 真实媒体失败后的恢复结果还需要后续人工验证。
