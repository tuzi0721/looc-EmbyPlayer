# WebDAV 列表搜索排序

- **动机**：WebDAV 目录浏览已能连接、收藏和播放队列，但目录内容一多就只能按服务端返回顺序扫列表；搜索后播放队列也应该跟随用户眼前看到的条目。
- **改动**：
  - `src/views/WebDavView.vue` — WebDAV 目录列表新增搜索框，可按名称、路径、扩展名和内容类型筛选当前目录条目。
  - `src/views/WebDavView.vue` — 新增排序下拉，支持名称、最近修改、大小和类型；目录、可播放视频、其他文件仍保持分组展示。
  - `src/views/WebDavView.vue` — 播放 WebDAV 文件时，direct queue 改为使用筛选/排序后的可见可播放列表。
  - `docs/CURRENT_STATE.md` — 记录 WebDAV 列表搜索/排序已落地，并更新 Phase 2 文件源能力边界。
- **验证**：
  - `npm.cmd run build`
  - `git diff --check`
  - 敏感关键字扫描
- **结果**：通过；WebDAV 目录可以快速筛选和调整顺序，点击播放时上一条/下一条与选集菜单跟随当前可见列表。
- **风险**：当前搜索只作用于当前目录已返回的 Depth 1 列表，不做远端递归索引或服务端全文搜索。
