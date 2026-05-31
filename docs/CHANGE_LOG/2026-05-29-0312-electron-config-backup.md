# 2026-05-29 03:12 - Electron 配置备份与还原

## 本段目标
- 让设置页“备份与还原”从静态占位变为 Electron 下可用的配置导入/导出入口。

## 变更
- Electron JSON store 新增配置备份导出与导入方法，导出内容包含设置、服务器、账号、当前账号和全局快捷键。
- Electron 主进程新增 `export_config` / `import_config` 命令，使用系统保存/打开对话框读写 JSON 备份文件。
- 导入配置默认采用合并模式：同 id 的服务器、账号、快捷键会更新，既有下载任务和通知不会被备份文件覆盖。
- 设置页“备份与还原”面板接入导出配置、导入配置按钮，并在导入后刷新设置、服务和账号状态。
- Tauri 路径下该面板保持不可用，避免调用尚未迁移的 Electron 专用命令。

## 验证
- `node --check electron\backend\store.mjs`
- `node --check electron\main.mjs`
- `npm.cmd run build`
- `rg -n "[ \t]+$" electron\backend\store.mjs electron\main.mjs src\api\index.ts src\views\SettingsView.vue docs\CURRENT_STATE.md docs\CHANGE_LOG\2026-05-29-0312-electron-config-backup.md`（无输出，退出码 1，表示未发现行尾空白）
- `npm.cmd run electron:build`
