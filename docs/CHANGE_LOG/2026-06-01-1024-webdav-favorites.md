# WebDAV 收藏入口

- **动机**：WebDAV 已能浏览目录、直链播放和生成当前目录队列，但常用 WebDAV 连接仍只能从页面左侧最近连接里找；用户从侧边栏回到文件源时缺少固定入口。
- **改动**：
  - `src/stores/webdav.ts` — WebDAV 连接记录新增 `favoritedAt`，提供收藏、取消收藏和清空收藏能力；收藏只挂在已有连接记录上，不另存凭据副本。
  - `src/views/WebDavView.vue` — 当前连接可通过星标收藏，未加载目录的空状态展示收藏 WebDAV 与最近 WebDAV 快捷入口。
  - `src/components/common/AppSidebar.vue` — 侧边栏 WebDAV 入口下方展示收藏连接和最近连接，可直接回到对应 WebDAV 连接。
  - `src/views/SettingsView.vue` / `docs/CURRENT_STATE.md` — 同步记录 WebDAV 连接收藏入口已可用。
- **验证**：
  - `npm.cmd run build`
  - `git diff --check`
  - 敏感关键字扫描
- **结果**：通过；WebDAV 常用连接可以从页面和侧边栏快速回到，减少每次重新找连接配置的操作。
- **风险**：收藏的是连接入口，不是具体远程文件；未保存密码的连接仍需要用户在表单中补齐密码后才能重新读取目录或播放。
