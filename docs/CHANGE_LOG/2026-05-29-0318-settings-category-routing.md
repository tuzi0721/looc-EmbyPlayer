# 2026-05-29 03:18 - 设置分类导航接线

## 本段目标
- 修复侧边栏设置分类跳转后，设置页没有展开对应面板的问题。

## 变更
- 设置页读取路由查询参数 `?c=`，并将 `servers`、`network`、`player`、`shortcuts`、`backup`、`appearance`、`library`、`about` 映射到对应面板。
- 侧边栏设置分类新增“备份”，可直达“备份与还原”面板。

## 验证
- `npm.cmd run build`
- `rg -n "[ \t]+$" src\views\SettingsView.vue src\components\common\AppSidebar.vue docs\CURRENT_STATE.md docs\CHANGE_LOG\2026-05-29-0318-settings-category-routing.md`（无输出，退出码 1，表示未发现行尾空白）
- `npm.cmd run electron:build`
