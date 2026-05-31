# 2026-05-29 14:40 Electron 字幕命令 no-op 清理

## 目标

让 Electron 主进程的 no-op 命令集合只保留真正的窗口嵌入兼容命令，避免已实现的字幕能力被迁移状态误标为占位。

## 变更

- 从 `electron/main.mjs` 的 `noOpCommands` 中移除 `add_subtitle`、`remove_subtitle`、`set_subtitle_delay`、`set_subtitle_scale`、`set_subtitle_style`、`cycle_subtitle`。
- 保留这些字幕命令现有的真实 mpv handler：外部字幕添加/移除、字幕延迟、字幕缩放、字幕样式应用和字幕轨切换仍走 mpv IPC。
- `noOpCommands` 现在只包含 `embed_attach`、`embed_set_rect`、`embed_set_visible`、`embed_detach`，用于兼容前端仍存在的嵌入窗口命令调用。

## 验证

已通过：

```powershell
Electron command coverage 脚本检查
node --check electron\main.mjs
行尾空白检查
npm.cmd run build
npm.cmd run electron:build
```

覆盖脚本结果：

- 前端 API 命令数：85。
- Electron handler 命令数：88。
- API 命令缺口：0。
- no-op 命令异常项：0。
- no-op 与真实 handler 重叠项：0。
- 6 个字幕命令均为 `handled: true` 且 `noOp: false`。

说明：`npm.cmd run electron:build` 通过；Electron builder 仍输出既有 duplicate dependency references 和 Node DEP0190 提示。

## 当前状态

- Electron 字幕命令不再被标记为 no-op 占位。
- no-op 集合语义收窄为仅处理嵌入窗口兼容调用。
- 播放器字幕面板、在线字幕添加和字幕样式设置继续由 mpv 后端执行。
