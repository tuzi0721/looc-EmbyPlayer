# 同步能力面板

- **时间**：2026-05-31 21:54 (UTC+8)
- **动机**：设置页“同步”此前提供 Trakt 开关、用户名和同步范围，但当前没有真实 Trakt OAuth、token 刷新或同步队列。继续保留可编辑开关会误导用户以为功能已经生效。
- **修改文件**：
  - `src/views/SettingsView.vue` — 将“同步”改为只读能力面板，展示 Trakt OAuth、观看记录同步、评分同步、收藏同步和 Douban 评分的待接入状态；移除未闭环的 Trakt 用户名输入和同步范围开关。
- **风险**：已有配置模型字段仍保留在后端和存储中，当前只是收窄 UI；后续接入真实 OAuth 和同步任务时可复用或迁移这些字段。
- **回滚**：恢复 `SettingsView.vue` 中的 Trakt 表单、`traktUsernameDraft` 与 `saveTraktUsername()` 即可回到原面板。
- **验证步骤**：
  - `npm.cmd run build`
  - `git diff --check`
  - in-app Browser 打开 1421 干净 dev server 并点击设置页“同步”
  - `npm.cmd run electron:build`
- **结果**：通过；同步面板显示 5 个待接入能力项，旧 Trakt 用户名与开关不再出现，1421 页面无新增 console error，Electron unpacked 包完整性检查通过。
