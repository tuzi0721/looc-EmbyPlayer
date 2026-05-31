# 收藏本地文件

- **时间**：2026-06-01 00:55 (UTC+8)
- **动机**：本地文件夹已经有最近记录、收藏目录、搜索和排序，但常用单个视频还只能依赖最近打开列表，缺少固定入口。
- **修改文件**：
  - `src/stores/localFiles.ts` — 新增 `hills-lite:favorite-local-files` 本地收藏列表，保存最多 32 个收藏文件，并提供收藏判断、切换和清空方法。
  - `src/views/LocalFolderView.vue` — 本地文件夹文件行新增星标按钮，可收藏或取消收藏单个视频，播放队列仍使用当前搜索与排序后的可见列表。
  - `src/components/common/AppSidebar.vue` — 侧边栏底部新增收藏本地文件分组，最近本地文件会避开已收藏项，减少重复入口。
  - `src/views/SettingsView.vue` — “文件服务 / 连接器”面板将收藏本地文件标记为可用能力。
- **风险**：收藏仅保存在当前客户端 `localStorage`，不做云同步，也不会主动检查文件是否仍存在；失效路径打开后沿用现有本地播放错误提示。
- **回滚**：移除收藏文件 store 字段、文件行星标按钮、侧边栏收藏分组和设置页能力项即可回到仅最近记录模式。
- **验证步骤**：
  - `npm.cmd run build`
  - in-app Browser 打开 `/settings?c=file-services`，确认“收藏本地文件”和“收藏本地文件夹”均标记为可用
  - in-app Browser 打开 `/local-folder?folder=...`，确认搜索、排序、收藏文件夹按钮与文件行收藏入口布局存在；Web Preview 无本地文件权限时仍返回空列表
  - `npm.cmd run electron:build`
  - `git diff --check`
  - 敏感关键字扫描
- **结果**：通过；Electron 命令覆盖检查仍为 93/93，Electron unpacked 包完整性检查通过，仓库未写入测试账号、密码、token 或完整播放 URL。
