# 2026-05-29 04:00 - 设置关于面板

## 本段目标
- 补齐设置页 about/pro 空入口，让侧边栏底部的 Hills Lite Pro 按钮能打开可用面板。

## 变更
- 设置页 `pro` 面板新增版本、运行壳、平台、服务器数、当前账号、播放核心与打包产物状态。
- 侧边栏底部 Hills Lite Pro 按钮改为跳转 `settings?c=about`，复用现有设置分类路由。
- about 面板提供“备份配置”和“服务器”快捷按钮，可直接切换到已有设置面板。

## 验证
- `npm.cmd run build` 首次在 Vite HTML 输出阶段遇到一次绝对路径 `A:/vsc/emby-player/index.html` 瞬时异常；未改代码后单独重跑通过，保留既有 PlayerView chunk 警告。
- 通过 `rg -n "[ \t]+$" src\views\SettingsView.vue src\components\common\AppSidebar.vue docs\CURRENT_STATE.md docs\CHANGE_LOG\2026-05-29-0400-settings-about-panel.md`，未发现行尾空白。
- 通过 `npm.cmd run electron:build`，Electron unpacked 产物保持在 `release-electron\win-unpacked\Hills Lite.exe`，保留既有 author/重复依赖/DEP0190 与 chunk 警告。
