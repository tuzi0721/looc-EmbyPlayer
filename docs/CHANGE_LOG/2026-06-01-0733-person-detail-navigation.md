# 人员作品页导航

- **时间**：2026-06-01 07:33 (UTC+8)
- **动机**：详情页已经展示演职人员头像、姓名和角色，但卡片不能继续进入此人的作品列表；PDP 目标中的 person navigation 还停留在展示层。
- **修改文件**：
  - `src/router/index.ts`：新增 `/person/:id` 路由。
  - `src/views/PersonView.vue`：新增人员作品页，复用 `list_items` 参数透传，通过 `PersonIds` 或名称筛选作品，支持排序、分页、空状态和错误状态。
  - `src/views/DetailView.vue`：演职人员卡片改为可点击按钮，按人员 id 或名称跳转到人员作品页。
- **风险**：不同 Emby/Jellyfin 服务端对无 id 人员的名称筛选参数兼容度可能不同；有人员 id 时优先使用 `PersonIds`。
- **回滚**：移除 `/person/:id` 路由和 `PersonView.vue`，并把详情页演职人员卡片恢复为静态展示。
- **验证步骤**：
  - `npm.cmd run build`
  - `git diff --check`
  - in-app Browser 打开真实条目详情页，确认演职员卡片渲染为按钮并具有非零尺寸。
  - 点击第一位演职员进入 `/person/...`，确认真实服务器返回人员作品列表，本次样本显示 `3 部作品` 且无错误。
- **结果**：通过；详情页演职员现在可以进入真实人员作品页，PDP 的 person navigation 闭环。
