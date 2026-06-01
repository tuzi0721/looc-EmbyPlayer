# Electron 桌面菜单清理

- **时间**：2026-06-01 17:40 (UTC+8)
- **动机**：用户反馈桌面窗口顶部 `File / Edit` 等系统菜单没有存在必要；产品窗口应呈现为播放器应用，而不是默认 Electron 壳。
- **修改文件**：
  - `electron/main.mjs`：引入 `Menu` 并在应用级调用 `Menu.setApplicationMenu(null)`；对所有新建 BrowserWindow 增加 `browser-window-created` 兜底，统一清空菜单、隐藏菜单栏并启用自动隐藏；开发模式下不再默认打开 DevTools，只有显式设置 `HILLS_ELECTRON_OPEN_DEVTOOLS=1` 才打开。
- **风险**：默认菜单移除后，调试入口需要通过环境变量显式开启；应用内文件打开、字幕导入、备份导入导出仍走现有按钮和原生对话框，不依赖系统菜单。
- **回滚**：恢复 `electron/main.mjs` 即可回到旧菜单行为。
- **验证步骤**：
  - `node --check electron\main.mjs`
  - `npm.cmd run build`
  - `git diff --check`
  - `npm.cmd run electron:build`
- **结果**：Electron 主进程语法检查、前端构建与 Electron unpacked 打包均通过；打包完整性检查确认 `app.asar`、随包 mpv 与 `electron_mpv_host.exe` 都存在。
