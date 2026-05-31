# 2026-05-29 13:55 Web 预览平台回退

## 目标

普通 Vite/Web 预览环境不再调用不存在的 Tauri `invoke`，让本地浏览器视觉验证可以稳定进入首页、首启引导和设置页。

## 变更

- `src/platform/index.ts` 新增 Web 预览回退层：无 Electron bridge、无 Tauri runtime 时，设置、服务器、账号、下载、通知、媒体列表等基础读取返回安全空数据或默认设置。
- Web 预览下 `update_settings` 会在内存中合并设置补丁，首启引导关闭、主题/播放器等设置 UI 可正常走通，不再触发控制台异常。
- `listen`、`openFileDialog`、`platformType` 在 Web 预览中分别回退为 no-op、`null`、`web`。
- 设置页关于面板的“运行壳”在 Web 预览中显示 `Web Preview`，平台显示 `web`；Electron/Tauri 桌面路径保持原有分支。

## 验证

已通过：

```powershell
rg -n "WEB_DEFAULT_SETTINGS|invokeWebFallback|Web Preview|platformLabel.value === \"web\"|hasTauriRuntime" src\platform\index.ts src\views\SettingsView.vue
rg -n "[ \t]+$" src\platform\index.ts src\views\SettingsView.vue
npm.cmd run build
npm.cmd run electron:build
```

浏览器验证已通过：

- 启动 `http://127.0.0.1:5173/`。
- 关闭首启引导。
- 进入“设置”。
- 展开“关于 Hills Lite”。
- 确认无新增控制台 error。
- 确认“运行壳”为 `Web Preview`，“平台”为 `web`。
- 确认无 `Hills Lite Pro`、`语言 Auto`、`交互` 残留。

说明：`npm.cmd run build` 与 `npm.cmd run electron:build` 均通过。Electron builder 仍有既有 duplicate dependency references 和 Node DEP0190 提示。

## 当前状态

- 桌面运行时仍优先走 Electron bridge / Tauri API。
- 普通浏览器预览可作为 UI 视觉验证环境使用，基础空状态不会刷 Tauri IPC 错误。
