# 收藏本地文件夹

- **时间**：2026-06-01 00:42 (UTC+8)
- **动机**：文件服务目标包含“浏览、收藏、历史”。本地文件夹已经支持最近记录、递归浏览和筛选，但常用目录还缺一个稳定收藏入口。
- **修改文件**：
  - `src/stores/localFiles.ts` — 新增 `hills-lite:favorite-local-folders` 本地收藏列表，保存最多 32 个收藏文件夹并做结构校验。
  - `src/views/LocalFolderView.vue` — 当前文件夹支持星标收藏/取消收藏；空状态展示收藏文件夹快捷入口，并避免和最近文件夹重复。
  - `src/components/common/AppSidebar.vue` — 侧边栏底部新增收藏本地文件夹分组，可直接打开或清空收藏。
  - `src/views/SettingsView.vue` — “文件服务 / 连接器”面板将收藏本地文件夹标记为可用能力。
- **风险**：收藏仅保存在当前客户端 `localStorage`，不做云同步，也不会主动检查路径是否仍存在；失效路径打开后沿用现有文件夹读取错误。
- **回滚**：移除收藏文件夹 store 字段和三个 UI 入口，将设置页能力项删除即可。
- **验证步骤**：
  - `npm.cmd run build`
  - `git diff --check`
  - in-app Browser 点击 `/local-folder?folder=...` 星标按钮，确认按钮状态切换、侧边栏出现收藏文件夹分组，并在验证后清理测试收藏
  - `npm.cmd run electron:build`
- **结果**：通过；Electron 命令覆盖检查仍为 93/93，Electron unpacked 包完整性检查通过。
