# Alist / OpenList 收藏入口

- **动机**：Alist / OpenList 已经支持基础目录浏览，但常用站点只能作为最近连接出现；需要补齐和 WebDAV 一致的收藏入口，方便把常用站点固定在侧边栏。
- **改动**：
  - `src/stores/alist.ts` — 连接记录新增 `favoritedAt`，提供收藏列表、星标切换和清空收藏能力。
  - `src/views/AlistView.vue` — 当前连接支持星标收藏/取消收藏，空状态展示收藏与最近连接快捷入口。
  - `src/components/common/AppSidebar.vue` — 侧边栏新增收藏 Alist 分组，并让最近 Alist 避开已收藏连接。
  - `docs/CURRENT_STATE.md` — 记录 Alist / OpenList 收藏入口已落地，并更新 Phase 2 文件源能力边界。
- **验证**：
  - `npm.cmd run build`
  - `npm.cmd run check:electron-commands`
  - in-app Browser `/alist?path=Movies%2F` 带路径页面目检
  - `git diff --check`
  - 敏感关键字扫描
- **结果**：通过；构建、命令覆盖、基础页面目检、空白检查与敏感扫描均已完成。
- **风险**：本轮浏览器会话没有已保存 Alist 连接，星标按钮的可见状态未做点击回归；代码路径与条件渲染已通过构建验证，后续真实站点回归时继续补星标点击验证。
