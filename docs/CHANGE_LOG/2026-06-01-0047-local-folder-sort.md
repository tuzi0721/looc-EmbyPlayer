# 本地文件夹排序

- **时间**：2026-06-01 00:47 (UTC+8)
- **动机**：递归扫描和搜索让本地文件夹列表更可用，但大目录里仍需要按路径、文件名、修改时间或大小快速整理当前结果。
- **修改文件**：
  - `src/views/LocalFolderView.vue` — 本地文件夹工具栏新增排序下拉，支持路径、文件名、最近修改和大小；播放队列使用搜索与排序后的可见列表。
- **风险**：排序只作用于当前已扫描结果；如果后端因 500 条上限截断，排序不会补扫未返回的文件。
- **回滚**：移除 `sortMode`、排序下拉和 `compareVideos` 即可恢复后端返回顺序。
- **验证步骤**：
  - `npm.cmd run build`
  - `git diff --check`
  - in-app Browser 打开 `http://localhost:1420/local-folder?folder=...`，确认排序下拉可见并可切到“大小”
  - `npm.cmd run electron:build`
- **结果**：通过；Electron 命令覆盖检查仍为 93/93，Electron unpacked 包完整性检查通过。
