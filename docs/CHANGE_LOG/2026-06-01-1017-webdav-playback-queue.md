# WebDAV 播放队列

- **动机**：上一阶段 WebDAV 已能浏览目录并播放单个直链，但点击视频后播放器没有当前目录队列，上一条/下一条和选集菜单不可用，体验不像本地文件夹和在线剧集。
- **改动**：
  - `src/stores/player.ts` — 播放器队列新增 `direct` 类型和 `DirectQueueEntry`，用于保存 WebDAV URL、标题、来源和本次会话凭据；上一条/下一条可继续播放同目录 WebDAV 文件。
  - `src/views/WebDavView.vue` — 点击视频前把当前目录所有可播放项写入 direct queue，并把来源连接与目录路径带到播放器路由。
  - `src/views/PlayerView.vue` — 选集菜单、上一条/下一条、标题副标题、自动跳片保护和返回按钮识别 WebDAV direct queue；返回会回到来源 WebDAV 目录。
  - `scripts/smoke-webdav-connector.mjs` — mock WebDAV 响应扩展为 2 个可播放视频，并新增 `--serve` 模式方便前端联调。
  - `docs/CURRENT_STATE.md` — 记录 WebDAV 播放队列已落地，并更新 Phase 2 文件源能力边界。
- **验证**：
  - `node --check scripts\smoke-webdav-connector.mjs`
  - `node scripts\smoke-webdav-connector.mjs`
  - `npm.cmd run build`
  - `git diff --check`
  - 敏感关键字扫描
- **结果**：通过；WebDAV 从“单条直链播放”推进到会话级播放队列，播放器控制栏的选集/上一条/下一条路径具备真实数据来源。
- **风险**：队列凭据只保存在当前前端会话内，不做跨会话持久化；WebDAV 文件收藏、远程字幕侧挂、远程封面/NFO、Range 代理与失败重试仍待后续阶段。
