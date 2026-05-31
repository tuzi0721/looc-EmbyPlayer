# 2026-05-29 11:55 播放器错误重试快捷键

## 目标

播放失败浮层出现时，用户可以直接按键盘 `r` 重试当前播放，不必移动鼠标到按钮。

## 变更

- 播放器键盘快捷键新增 `r`。
- 仅当 `errorText` 存在时，`r` 才会触发 `retryPlayback()`。
- 保留重试按钮已有的 loading 与防连点逻辑。

## 验证

已通过：

```powershell
rg -n "错误后重试播放|retryPlayback" src\views\PlayerView.vue
rg "[ \t]+$" src\views\PlayerView.vue
npm.cmd run build
npm.cmd run electron:build
```

说明：`npm.cmd run build` 与 `npm.cmd run electron:build` 均通过；author 缺失警告保持消失，仍有既有 duplicate dependency references 和 Node DEP0190 提示。没有在真实错误浮层里人工按 `r` 验证。

## 当前状态

- 播放器错误恢复支持按钮和键盘两种入口。
- 快捷键只在存在错误浮层时生效，避免影响正常播放时的键位。
- 真实键盘事件路径还需要后续人工验证。
