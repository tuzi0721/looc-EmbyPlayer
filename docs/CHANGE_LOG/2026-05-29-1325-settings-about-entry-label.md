# 2026-05-29 13:25 设置关于入口去 Pro 化

## 目标

设置页和侧边栏不再使用没有会员/付费功能支撑的 “Hills Lite Pro” 文案，改为真实的关于入口。

## 变更

- 将设置页 `PanelId` 中的 `pro` 面板改名为 `about`，`?c=about` 继续打开同一关于面板。
- 将设置页入口文案从 “Hills Lite Pro” 改为“关于 Hills Lite”，图标从皇冠改为信息图标。
- 将侧边栏底部 “Hills Lite Pro” 按钮改为“关于 Hills Lite”，并将样式类名从 `pro-btn` 改为 `about-btn`。

## 验证

已通过：

```powershell
rg -n "Hills Lite Pro|pro-btn|togglePanel\(\x27pro\x27\)|openPanel === \x27pro\x27|\| \"pro\"|lucide:crown" src\views\SettingsView.vue src\components\common\AppSidebar.vue
rg -n "[ \t]+$" src\views\SettingsView.vue src\components\common\AppSidebar.vue
rg -n "about-btn|关于 Hills Lite|openPanel === \x27about\x27|togglePanel\(\x27about\x27\)" src\views\SettingsView.vue src\components\common\AppSidebar.vue
npm.cmd run build
npm.cmd run electron:build
```

说明：`Pro/pro` 占位语义残留检查无匹配，关于入口落点检查正常；`npm.cmd run build` 与 `npm.cmd run electron:build` 均通过。Electron builder 仍有既有 duplicate dependency references 和 Node DEP0190 提示。

## 当前状态

- 关于入口现在以“关于 Hills Lite”呈现，展开后显示版本、运行壳、平台、服务器、账号、播放核心和打包产物。
- `settings?c=about` 仍是侧边栏和设置分类进入关于面板的稳定入口。
