# 2026-05-29 10:25 截图路径复制

## 目标

截图保存后，除了打开目录，也能直接复制截图完整路径，方便贴到聊天、工单或文件定位工具里。

## 变更

- 截图提示条在有截图路径时新增“复制路径”按钮。
- 新增前端 `writeTextToClipboard` 辅助函数，优先使用 `navigator.clipboard.writeText`。
- 当标准 Clipboard API 不可用或被拒绝时，回退到隐藏 `textarea` + `document.execCommand("copy")`。
- 复制成功后提示“截图路径已复制”，并继续保留本次截图路径，让用户还能继续打开目录或再次复制。
- 复制失败时提示失败原因，同时保留截图路径便于重试。

## 验证

已通过：

```powershell
rg -n "writeTextToClipboard|copyScreenshotPath|复制路径|截图路径已复制|复制失败" src\views\PlayerView.vue
rg "[ \t]+$" src\views\PlayerView.vue
npm.cmd run build
npm.cmd run electron:build
```

说明：`npm.cmd run build` 仍有已知的 PlayerView chunk 超过 500 kB 提示；`npm.cmd run electron:build` 仍有已知的 package author、重复依赖和 Node DEP0190 提示。没有在真实播放器会话里执行截图并人工点击“复制路径”，本段验证覆盖前端类型检查、生产构建、落点检查、空白检查和 Electron dir 打包。

## 当前状态

- 截图提示条现在支持“复制路径”和“打开目录”两种后续动作。
- 剪贴板写入使用前端能力，不新增 Electron/Tauri 依赖。
- 真实系统剪贴板写入还需要后续在桌面运行态做人工确认。
