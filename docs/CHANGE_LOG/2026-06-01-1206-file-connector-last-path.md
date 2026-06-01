# 文件连接器上次目录

- **动机**：WebDAV 与 Alist/OpenList 已有最近/收藏连接，但从侧边栏或页面快捷入口回到连接时会回到根目录；用户在深层目录浏览后再次打开，需要重复逐级进入。
- **改动**：
  - `src/stores/webdav.ts` 与 `src/stores/alist.ts` — 连接记录新增本地 `lastPath` 字段，加载旧记录时自动兼容；成功浏览目录后更新 `lastUsedAt` 与上次目录。
  - `src/views/WebDavView.vue` 与 `src/views/AlistView.vue` — 选择最近/收藏连接、默认打开最近连接时优先回到 `lastPath`；连接成功后将服务端规范化后的目录路径写回本地连接记录。
  - `src/components/common/AppSidebar.vue` — 侧边栏 WebDAV 与 Alist/OpenList 收藏/最近入口会携带对应连接的上次目录。
  - `docs/CURRENT_STATE.md` — 记录文件连接器可回到上次目录。
- **验证**：
  - `npm.cmd run build`
  - `git diff --check`
  - 敏感关键字扫描
- **结果**：通过；前端构建完成，旧连接记录无 `lastPath` 时保持根目录兼容。
- **风险**：`lastPath` 只保存在当前客户端 localStorage，属于本地便利状态；如果目录权限变化或路径被删除，页面会按现有连接失败/目录失败状态提示。
