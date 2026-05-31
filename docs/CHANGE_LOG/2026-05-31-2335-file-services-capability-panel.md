# 文件服务能力面板

- **时间**：2026-05-31 23:35 (UTC+8)
- **动机**：文件源路线已经落地单个本地文件播放、最近本地文件、同名字幕和同名 XML 弹幕，但 WebDAV、SMB、Alist / OpenList、Plex 等连接器仍未实现。设置页需要把真实能力边界讲清楚，避免用户把待接入项误认为已经可用。
- **修改文件**：
  - `src/views/SettingsView.vue` — 新增“文件服务 / 连接器”只读能力面板，并支持 `/settings?c=file-services`、`files`、`connectors`、`sources` 查询参数直达。
  - `src/views/SettingsView.vue` — 将本地单文件、最近本地文件、同名字幕、同名 XML 弹幕标记为“可用”；将文件夹媒体库、WebDAV、SMB、Alist / OpenList、Plex 连接器标记为“待接入”。
- **风险**：本阶段只补齐设置页状态面板，不新增真实文件服务连接、远程目录浏览或 Plex 鉴权；后续实现连接器时需要同步把状态从“待接入”改为真实可用链路。
- **回滚**：移除 `fileServices` panel id、查询参数映射、`fileServiceCapabilities` 数据和对应模板块即可恢复原设置页。
- **验证步骤**：
  - `npm.cmd run build`
  - `git diff --check`
  - in-app Browser 打开 `http://localhost:1420/settings?c=file-services`，确认面板直达展开且能力状态显示正确
  - `npm.cmd run electron:build`
- **结果**：通过；前端构建、行尾空白检查、浏览器 DOM 目检和 Electron unpacked 包完整性检查均通过。
