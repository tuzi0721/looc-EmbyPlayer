# 2026-06-01 03:46 Web Preview 配置备份

## 变更

- Web Preview 的 `export_config` 改为生成与 Electron 相同结构的 `hills-lite-config-YYYY-MM-DD.json` 下载文件，包含设置、服务器、账号和当前账号信息。
- Web Preview 的 `import_config` 改为打开 JSON 文件选择器，默认按 `merge` 合并同 id 的服务器与账号，并刷新本地预览状态。
- 设置页“备份与还原”在 Electron 与 Web Preview 中开放，Tauri 未接入文件对话框前继续禁用。

## 验证

- 真实服务器回归：通过 Web Preview 临时新增两条 443 线路并使用测试账号登录，确认新增服务器为追加而非覆盖，自动识别为 Emby，首页拉到 5 个媒体库；临时测试服务器已删除，验证过程未写入密码、token 或完整线路地址。
- `npm.cmd run build`
- in-app Browser 冷刷新 `/settings?c=backup`，确认“备份与还原”可点击，面板显示“导出配置 / 导入配置”。

## 注意

- 未实际点击导出按钮，避免在测试环境生成包含账号 token 的备份文件。
