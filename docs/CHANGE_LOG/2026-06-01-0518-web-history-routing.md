# Web Preview 路由地址同步

- **时间**：2026-06-01 05:18 (UTC+8)
- **动机**：真实播放回归时发现 Web Preview 从首页进入媒体库、详情和播放器后，内部页面已切换但地址栏仍停在 `/home`，刷新、返回和分享链接都会失真。
- **修改文件**：
  - `src/router/index.ts`：非 `file://` 环境使用 `createWebHistory()`，让 Vite/Web Preview 与开发服务同步浏览器地址；`file://` 打包环境继续使用 `createMemoryHistory()`，保持 Electron release 的本地文件启动兼容。
- **风险**：开发服务需要继续依赖 Vite history fallback 支持深链；打包 `file://` 路径不切换 history 模式。
- **回滚**：将 `src/router/index.ts` 恢复为固定 `createMemoryHistory()`。
- **验证步骤**：
  - `npm.cmd run build`
  - `npm.cmd run electron:build`
  - `git diff --check`
  - in-app Browser 冷开 `http://127.0.0.1:1421/home`，用真实测试账号当前会话从首页进入真实媒体库和详情，确认地址栏同步到 `/item/...`。
  - 在详情页点击继续播放，确认地址栏同步到 `/player/...?...`，播放器路由创建 HTML 视频对象并保留真实媒体宽高。
  - 敏感值扫描确认未写入测试账号、密码、token 或完整线路地址。
- **结果**：通过；Web Preview 导航现在具备真实地址栏状态，刷新、返回和复制链接的基础行为不再依赖隐藏的 memory route。
