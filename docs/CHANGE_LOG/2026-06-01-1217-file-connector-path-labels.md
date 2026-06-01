# 文件连接器路径标签

- **动机**：WebDAV 与 Alist/OpenList 已能记录并恢复上次目录，但收藏/最近入口只显示连接名；用户点击前看不出会回到根目录还是深层目录。
- **改动**：
  - `src/utils/fileConnectorPaths.ts` — 新增共享路径格式化工具，把连接器相对路径统一显示为 `/path`。
  - `src/components/common/AppSidebar.vue` — 侧边栏 WebDAV 与 Alist/OpenList 收藏/最近入口在有上次目录时显示第二行路径，并在 tooltip 中带上连接 URL 与路径。
  - `src/views/WebDavView.vue` 与 `src/views/AlistView.vue` — 页面左侧连接胶囊和空状态快捷入口同步显示上次目录路径。
  - `docs/CURRENT_STATE.md` — 记录文件连接器路径标签已落地。
- **验证**：
  - `npm.cmd run build`
  - `git diff --check`
  - 敏感关键字扫描
  - in-app Browser 打开 `/alist` 与 `/webdav`，确认页面可加载且 `scrollWidth == clientWidth`
- **结果**：通过；路径标签补齐后前端构建通过，空白检查无错误，触碰文件未出现测试账号、密码、真实线路或 token 明文。
- **风险**：路径标签来自本地 `lastPath`，如果目录之后被服务端删除，点击后仍按现有目录加载失败提示处理；当前浏览器没有已保存连接，浏览器目检覆盖页面布局，具体标签展示由 Vue 构建和模板绑定覆盖。
