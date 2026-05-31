# 2026-06-01 04:10 Tauri 配置备份

## 变更

- Tauri 新增 `export_config` / `import_config` 命令，使用系统保存/打开对话框读写与 Electron/Web Preview 相同结构的 `hills-lite-config` JSON。
- Tauri 配置导入支持 `merge` / `replace` 两种模式：合并按 id 追加或覆盖服务器与账号，替换会用备份内容重建设置、服务器、账号和当前账号。
- 导入后的全局快捷键会同步写入 Tauri store 并刷新运行态注册；若快捷键注册失败，会尝试恢复导入前的快捷键。
- 设置页“备份与还原”在 Tauri 运行时解除禁用，Web Preview 与 Electron 行为保持不变。

## 验证

- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- `npm.cmd run build`
- `npm.cmd run electron:build`
- in-app Browser 冷刷新 `/settings?c=backup`，确认“导出配置 / 合并导入 / 替换导入”可见且面板未禁用。
- `git diff --check`
- 敏感关键字扫描：未在本轮 diff 中写入测试账号、密码、token 或完整线路地址。
