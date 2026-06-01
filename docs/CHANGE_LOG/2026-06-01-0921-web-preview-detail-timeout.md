# Web Preview 详情加载超时

- **时间**：2026-06-01 09:21 (UTC+8)
- **动机**：真实服务器会话从类型作品页进入详情时，浏览器预览可能长期停留在“加载中”，用户无法看到错误态或继续操作。
- **修改文件**：
  - `src/platform/index.ts`：Web Preview 直连请求与 `__hills_web_proxy` fallback 均接入设置中的请求超时，并在代理超时时返回带上下文的错误。
  - `vite.config.ts`：本地 Web 代理读取前端传入的 `timeoutMs`，通过 `AbortController` 约束真实 API 请求，避免代理层永久等待。
  - `src/views/DetailView.vue`：详情页主详情请求增加页面侧超时保护，超时后进入现有错误态。
  - `docs/CURRENT_STATE.md`：同步记录本阶段状态与验证结果。
- **风险**：极慢服务器在超过当前请求超时后会显示失败态，需要用户调大设置中的请求超时后重试；流媒体代理不受此超时影响，避免打断播放分片。
- **回滚**：移除 Web Preview fetch 超时、Vite 代理超时参数和详情页 `withDetailTimeout` 包装即可。
- **验证步骤**：
  - `npm.cmd run build`
  - `git diff --check`
  - 敏感关键字扫描，确认未写入测试账号、密码、token 或完整线路地址。
- **结果**：通过；Web Preview 详情页请求现在会在超时后进入错误态，不再无限停留在加载中。
