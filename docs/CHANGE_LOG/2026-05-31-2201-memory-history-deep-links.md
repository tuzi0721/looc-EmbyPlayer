# Memory History 深链接冷开

- **时间**：2026-05-31 22:01 (UTC+8)
- **动机**：前端使用 `createMemoryHistory` 后，浏览器或开发服务冷开 `/settings?c=...`、`/downloads?task=...` 会先落到首页，之前下载通知任务定位也因此无法用直接 URL 做验证。需要在不破坏 Electron 打包 `file://` 的前提下恢复开发/预览深链接。
- **修改文件**：
  - `src/main.ts` — 启动时读取非 `file://` 的浏览器路径，若路径不是 `/` 或 `index.html`，则在挂载前 `router.replace()` 到该路径；`file://` 打包入口保持原 memory history 行为。
- **风险**：只同步浏览器地址中的 path/query/hash route，不改变应用内导航；若未来切换到 web/hash history，需要复核这段启动兼容逻辑。
- **回滚**：移除 `initialMemoryRoute()` 与启动时的 `router.replace(initialRoute)` 即可恢复原冷开行为。
- **验证步骤**：
  - `npm.cmd run build`
  - `git diff --check`
  - in-app Browser 冷开 `http://127.0.0.1:1421/settings?c=sync`
  - in-app Browser 冷开 `http://127.0.0.1:1421/downloads?task=demo`
  - `npm.cmd run electron:build`
- **结果**：通过；`settings?c=sync` 直接展开同步面板，`downloads?task=demo` 直接进入下载页空态，1421 页面无新增 console error，Electron unpacked 包完整性检查通过。
