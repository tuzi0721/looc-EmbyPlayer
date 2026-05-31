# 最近本地文件夹

- **时间**：2026-06-01 00:08 (UTC+8)
- **动机**：本地文件夹浏览和队列已经可用，但用户每次都需要重新选择目录；文件源入口应像最近本地文件一样保留最近打开过的文件夹。
- **修改文件**：
  - `src/stores/localFiles.ts` — 在现有最近本地文件 store 中新增最近本地文件夹列表，使用独立 `localStorage` key 保存最近 8 个文件夹。
  - `src/components/common/AppSidebar.vue` — 侧边栏底部展示最近 2 个本地文件夹，并提供清空最近本地文件夹入口。
  - `src/views/LocalFolderView.vue` — 成功打开或加载文件夹后记录到最近文件夹；未选择文件夹时展示最近 6 个文件夹快捷入口。
- **风险**：最近文件夹只保存在当前客户端 `localStorage`，不会同步到服务器，也不会校验历史路径是否仍然存在；失效路径进入页面后会显示现有读取错误。
- **回滚**：移除 `folderItems`、`rememberFolder`、`clearFolders` 以及侧边栏/本地文件夹页的最近文件夹 UI 即可。
- **验证步骤**：
  - `npm.cmd run build`
  - `git diff --check`
  - in-app Browser 打开 `http://localhost:1420/local-folder` 目检空状态
  - `npm.cmd run electron:build`
- **结果**：通过；Electron 命令覆盖检查仍为 93/93，Electron unpacked 包完整性检查通过。
