# 2026-05-29 13:40 移除设置页静态占位行

## 目标

设置页不再展示看起来可操作、但没有真实配置后端的静态行，避免用户误以为这些入口可以点击或配置。

## 变更

- 移除通用分组里的“语言 Auto”静态行；当前应用还没有多语言设置后端。
- 移除播放器分组里带箭头的“交互”静态行；真实播放器设置仍保留在“播放器”面板内。
- 当前状态文档的 Phase 2 待办改为“暂无新增待办”，不再保留已经完成的详情页类型/进度条条目。

## 验证

已通过：

```powershell
rg -n "<span>语言</span>|<span>交互</span>|row--static[\s\S]*语言|row--static[\s\S]*交互" src\views\SettingsView.vue
rg -n "row--static|关闭时最小化到托盘|备份与还原|chev dim" src\views\SettingsView.vue
rg -n "[ \t]+$" src\views\SettingsView.vue
npm.cmd run build
npm.cmd run electron:build
```

说明：“语言”与“交互”静态占位行无残留；`row--static` 仅剩带真实开关的“关闭时最小化到托盘”。`npm.cmd run build` 与 `npm.cmd run electron:build` 均通过。Electron builder 仍有既有 duplicate dependency references 和 Node DEP0190 提示。

## 当前状态

- 设置页通用分组从“关于 Hills Lite”直接进入“主题”，播放器分组从标题直接进入“播放器”面板。
- 备份与还原、托盘关闭、播放器参数、外部播放器、弹幕、快捷键等保留真实可用入口。
