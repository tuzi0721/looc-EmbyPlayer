# 合集内容区

- **时间**：2026-06-01 07:42 (UTC+8)
- **动机**：媒体库已经允许 `BoxSet` 合集进入列表和详情页，但详情页没有展开合集内作品；PDP 目标中的 collections 还缺少真实内容入口。
- **修改文件**：
  - `src/views/DetailView.vue`：识别 `BoxSet` 后通过现有 `list_items(parentId)` 拉取合集子项，并新增“合集内容”横滑区，可点击子项进入详情。
- **规则**：合集子项只请求 Movie / Series，按 SortName 升序展示，继续复用 JAV 过滤规则；无子项或请求失败时不展示空壳区块。
- **风险**：不同 Emby/Jellyfin 服务端对 BoxSet 子项的 ParentId 返回可能有差异；当前实现不新增后端命令，只复用已贯通的 `list_items`。
- **回滚**：移除 `collectionItems` / `loadingCollection` 状态、`loadCollectionItems()` 和“合集内容”模板段。
- **验证步骤**：
  - `npm.cmd run build`
  - `git diff --check`
  - in-app Browser 使用真实服务器会话扫描 5 个媒体库首屏，未发现可用于目检的 BoxSet 样本，因此本阶段未伪造合集数据。
- **结果**：构建通过；详情页已具备真实合集内容区，等待有 BoxSet 样本时可直接目检。
