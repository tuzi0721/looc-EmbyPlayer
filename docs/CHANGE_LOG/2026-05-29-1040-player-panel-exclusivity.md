# 2026-05-29 10:40 播放器面板互斥

## 目标

避免播放器内字幕面板、弹幕菜单、设置菜单、章节菜单、选集菜单和统计浮层同时打开，减少底部控制区叠层遮挡。

## 变更

- 新增播放器内统一面板切换器：`togglePlayerPanel`、`openPlayerPanel`、`closePlayerPanels`。
- 字幕按钮、弹幕菜单按钮、设置按钮、章节按钮、选集按钮和键盘 `s` 统一走面板切换器。
- 打开任一面板时会关闭其他播放器面板，重复点击当前面板则关闭当前面板。
- 设置菜单内的“字幕设置”“弹幕设置”“统计信息”改为切换到对应面板，而不是叠开在设置菜单上。
- 当前播放条目变化时关闭所有临时播放器面板，避免上一条目的浮层状态残留。

## 验证

已通过：

```powershell
rg -n "= !subtitlePanelOpen|= !settingsMenuOpen|= !episodeMenuOpen|= !chapterMenuOpen|= !danmakuMenuOpen|= !statsOpen|togglePlayerPanel|openPlayerPanel|closePlayerPanels" src\views\PlayerView.vue
rg "[ \t]+$" src\views\PlayerView.vue
npm.cmd run build
npm.cmd run electron:build
```

说明：`npm.cmd run build` 仍有已知的 PlayerView chunk 超过 500 kB 提示；`npm.cmd run electron:build` 仍有已知的 package author、重复依赖和 Node DEP0190 提示。没有在真实播放器窗口里逐个点击面板做人工视觉目检。

## 当前状态

- 播放器临时面板现在按单面板模型工作。
- 选集菜单仍保留原有懒加载队列详情逻辑。
- 真实窗口里的按钮点击顺序和动画观感仍需后续人工确认。
