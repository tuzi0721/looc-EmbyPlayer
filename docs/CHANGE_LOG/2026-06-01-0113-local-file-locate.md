# 本地文件定位入口

- **时间**：2026-06-01 01:13 (UTC+8)
- **动机**：本地文件夹列表已经支持递归、搜索、排序、收藏和同名封面，但用户想从列表回到系统文件管理器时仍要手动复制路径。文件源能力需要补齐“定位到本地目录”的轻量闭环。
- **修改文件**：
  - `src/views/LocalFolderView.vue` — 顶部工具栏新增“在系统中打开文件夹”按钮；文件行新增“打开所在文件夹”按钮，并复用平台层 `openPath` 调用系统文件管理器。
  - `src/views/SettingsView.vue` — “文件服务 / 连接器”面板将“本地文件定位”标记为可用能力。
- **风险**：本阶段只打开目录，不做跨平台高亮选中文件；Web Preview 仍受浏览器权限限制，实际打开系统路径需要 Electron/Tauri 桌面运行时。
- **回滚**：移除文件夹页的两个定位按钮、`directoryFromPath()` 与对应设置页能力项即可恢复原状。
- **验证步骤**：
  - `npm.cmd run build`
  - in-app Browser 打开 `/settings?c=file-services`，确认“本地文件定位”为可用；打开 `/local-folder?folder=...`，确认有当前文件夹定位按钮
  - `npm.cmd run electron:build`
  - `git diff --check`
  - diff-only 敏感信息扫描
- **结果**：通过；Electron 命令覆盖检查仍为 93/93，Electron unpacked 包完整性检查通过，仓库 diff 未写入测试账号、密码、token 或完整播放 URL。
