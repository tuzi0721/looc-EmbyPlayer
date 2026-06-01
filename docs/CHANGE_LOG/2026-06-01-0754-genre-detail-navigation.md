# 详情页类型导航

- **时间**：2026-06-01 07:54 (UTC+8)
- **动机**：详情页已经展示 Emby/Jellyfin 返回的类型标签，但此前只是静态标签；PDP 元数据目标里还缺少从类型继续发现同类作品的入口。
- **修改文件**：
  - `src/views/DetailView.vue`：将 Hero 类型标签改为可点击按钮，优先使用 `GenreItems.Id` 跳转，缺少 id 时按名称跳转。
  - `src/views/GenreView.vue`：新增类型作品列表页，复用 `list_items` 的 `GenreIds` / `Genres` 过滤、排序、分页加载和海报卡片进入详情。
  - `src/router/index.ts`：新增 `/genre/:id` 路由。
- **风险**：不同 Emby/Jellyfin 版本对 `GenreIds` / `Genres` 的过滤支持可能存在差异；页面保留空状态和错误状态，不伪造结果。
- **回滚**：删除新增路由和 `GenreView.vue`，并把详情页类型标签恢复为静态展示即可。
- **验证步骤**：
  - `npm.cmd run build`
  - `git diff --check`
  - in-app Browser 使用真实服务器会话直接打开 `/genre/name:...`，确认 `Genres` 过滤能返回真实作品列表。
- **结果**：通过；真实服务器会话中 `/genre/name:动画` 返回 `722 部作品`，首屏 48 张海报卡片可见，页面无错误空状态。本阶段尝试从媒体库进入真实详情页时，详情接口停在加载态，未把“详情页点击类型标签”记为已人工点通；代码路径和构建已覆盖该入口，后续可在详情接口恢复后补一次点击回归。
