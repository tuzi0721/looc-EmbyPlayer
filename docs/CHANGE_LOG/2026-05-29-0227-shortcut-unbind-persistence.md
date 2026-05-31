# 2026-05-29 02:27 - 快捷键解绑持久化

## 本段目标
- 让全局快捷键在 Electron 迁移路径中支持列表、录制、解绑和重置的真实持久化。
- 修复 Tauri 侧全部解绑后重启又回到默认快捷键的问题。

## 变更
- Electron JSON 状态新增 `globalShortcuts`，默认包含播放/停止/上一首/下一首/显示隐藏窗口快捷键。
- Electron 主进程接入 `globalShortcut`，启动时注册已保存绑定，设置页保存/解绑/重置时同步注册状态。
- Electron 通过 `hills:event:shortcut:trigger` 复用前端已有快捷键动作监听，`toggle_window` 会直接显示/隐藏主窗口。
- Tauri `load_bindings` 现在会保留已保存的空数组，允许用户清空全部全局快捷键并跨重启保持解绑。
- 快捷键设置页解绑按钮新增 `title` 与 `aria-label`，图标按钮在无文字场景下可被辅助技术识别。

## 验证
- 通过 `node --check electron/backend/store.mjs`。
- 通过 `node --check electron/main.mjs`。
- 通过 `npm.cmd run build`。
- 通过 `cargo check --manifest-path src-tauri/Cargo.toml --all-targets`。
- 通过修改文件行尾空白检查。
- 通过 `npm.cmd run electron:build`，产物目录为 `release-electron\win-unpacked`。
