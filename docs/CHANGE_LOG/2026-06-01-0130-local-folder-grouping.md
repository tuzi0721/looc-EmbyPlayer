# 本地文件夹分组

- **时间**：2026-06-01 01:30 (UTC+8)
- **动机**：本地文件夹递归扫描后，剧集/合集目录会被拉平成一长串列表；用户需要按子目录快速辨认当前视频属于哪个季、合集或文件夹。
- **修改文件**：
  - `src/views/LocalFolderView.vue` — 递归浏览时新增“按文件夹分组”开关，开启后按 `relativePath` 的父目录生成分组标题，并保持播放队列索引仍对应当前排序/筛选后的列表。
  - `src/views/SettingsView.vue` — “文件服务 / 连接器”面板将“文件夹分组”标记为可用能力。
- **风险**：分组只影响当前列表展示，不改变后台扫描、排序、搜索和播放队列来源；根目录视频归入“根目录”组。
- **回滚**：移除 `groupByFolder`、`visibleGroups`、分组标题 UI 和设置页能力项即可恢复纯平铺列表。
- **验证步骤**：
  - `npm.cmd run build`
  - in-app Browser 打开 `/settings?c=file-services`，确认“文件夹分组”为可用；打开 `/local-folder?folder=...` 后启用“包含子文件夹”，确认出现“按文件夹分组”开关
  - `npm.cmd run electron:build`
  - `git diff --check`
  - diff-only 敏感信息扫描
- **结果**：通过；Electron 命令覆盖检查仍为 93/93，Electron unpacked 包完整性检查通过，仓库 diff 未写入测试账号、密码、token 或完整播放 URL。
