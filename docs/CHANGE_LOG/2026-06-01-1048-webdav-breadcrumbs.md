# WebDAV 路径面包屑

- **动机**：WebDAV 多级目录只能通过“上一级”逐级返回，深层目录浏览时很难快速跳回某个上级路径。
- **改动**：
  - `src/views/WebDavView.vue` — 根据当前 `path` 生成 WebDAV 面包屑，根目录和每一级路径都可点击跳转。
  - `src/views/WebDavView.vue` — 面包屑使用横向滚动与省略布局，长目录名不会撑开标题区域。
  - `docs/CURRENT_STATE.md` — 记录 WebDAV 路径面包屑已落地，并更新 Phase 2 文件源能力边界。
- **验证**：
  - `npm.cmd run build`
  - `git diff --check`
  - 敏感关键字扫描
- **结果**：通过；WebDAV 深层路径可以直接回到任意上级目录。
- **风险**：面包屑只基于当前路由 `path` 生成，不额外请求远端目录树；服务端路径如果包含非常规编码，仍以当前已解析的路由路径为准。
