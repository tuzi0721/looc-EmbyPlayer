# 文件服务面板摘要

- **动机**：Alist/OpenList 已完成页面、收藏、上次目录、侧挂资源和播放前直链刷新，但设置页“文件服务 / 连接器”摘要仍只写“本地 / WebDAV 可用”，容易误导用户以为 Alist 还没闭环。
- **改动**：
  - `src/views/SettingsView.vue` — 文件服务摘要更新为“本地 / WebDAV / Alist 可用”。
  - `src/views/SettingsView.vue` — Alist/OpenList 能力说明补充收藏站点、恢复上次目录、刷新签名直链与同名字幕/XML 弹幕播放。
  - `docs/CURRENT_STATE.md` — 记录设置页文件服务摘要已同步。
- **验证**：
  - `npm.cmd run build`
  - `git diff --check`
  - 敏感关键字扫描
  - in-app Browser 打开 `/settings?c=file-services`，确认摘要与 Alist/OpenList 说明已更新且无横向溢出
- **结果**：通过；设置页文件服务面板已显示“本地 / WebDAV / Alist 可用”，Alist/OpenList 描述包含刷新签名直链与同名字幕/XML 弹幕。
- **风险**：本阶段只更新设置页能力描述，不新增 SMB、Plex 或在线元数据刮削能力。
