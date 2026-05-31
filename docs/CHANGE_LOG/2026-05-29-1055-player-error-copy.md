# 2026-05-29 10:55 播放器错误复制

## 目标

播放失败时，用户能直接复制错误诊断信息，便于继续定位 mpv、HLS、鉴权或媒体源问题。

## 变更

- 播放器错误浮层新增“复制错误”按钮。
- 复制内容包含 Hills Lite 播放错误标识、时间、当前 ItemId、标题和错误正文。
- 复制成功后在错误浮层内显示“错误信息已复制”。
- 复制失败时显示失败原因，便于判断剪贴板权限或运行环境问题。
- 卸载播放器时清理错误复制状态计时器，避免离开页面后残留异步状态更新。

## 验证

已通过：

```powershell
rg -n "errorCopyStatus|errorCopyTimer|formatPlayerErrorDetails|copyPlayerError|复制错误|错误信息已复制|player__error-actions|player__error-status" src\views\PlayerView.vue
rg "[ \t]+$" src\views\PlayerView.vue
npm.cmd run build
npm.cmd run electron:build
```

说明：`npm.cmd run build` 仍有已知的 PlayerView chunk 超过 500 kB 提示；`npm.cmd run electron:build` 仍有已知的 package author、重复依赖和 Node DEP0190 提示。没有在真实播放失败场景里点击“复制错误”做人工剪贴板验证。

## 当前状态

- 播放失败浮层支持复制诊断文本。
- 复制能力复用播放器内已有前端剪贴板辅助函数。
- 真实错误场景下的文案可读性和剪贴板结果还需要后续人工确认。
