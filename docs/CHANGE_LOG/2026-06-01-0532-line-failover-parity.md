# 线路测活自动切线三端对齐

- **时间**：2026-06-01 05:32 (UTC+8)
- **动机**：Tauri `test_lines` 已会在自动故障转移开启时根据测活结果更新 active line，但 Electron 与 Web Preview 只写回线路健康状态，不会同步切换当前线路。用户当前主要在 Web Preview 里用真实服务器回归，多线路测活结果不能只停留在 UI 状态。
- **修改文件**：
  - `electron/main.mjs`：新增 `bestLineId`，Electron `test_lines` 写回健康状态后，在 `autoFailover` 未关闭时选择启用且非 down 的最佳线路。
  - `src/platform/index.ts`：Web Preview fallback 新增同等 `bestWebLineId` 逻辑，测活完成后与 Tauri 保持一致的 active line 更新规则。
  - `docs/CURRENT_STATE.md` 与旧线路验证日志：顺手脱敏早前写入的完整真实线路地址，保留“线路1/线路2”结论但不保留完整域名。
- **规则**：候选线路必须启用且状态不是 down；排序先看 `priority`，再看 `lastLatencyMs`，缺失延迟视为最后。
- **风险**：当多条线路都可用时仍优先尊重线路优先级，延迟只在同优先级内参与选择；这与现有 Tauri 行为保持一致。
- **回滚**：移除新增 helper，并让 Electron/Web Preview 的 `test_lines` 只更新线路状态。
- **验证步骤**：
  - `node --check electron\main.mjs`
  - `npm.cmd run build`
  - in-app Browser 打开 Web Preview，使用真实测试账号临时添加两条 443 线路，确认自动识别为 Emby 并登录成功。
  - 在设置页对真实服务器执行测活，两条线路返回真实秒级延迟；未写入账号、密码、token 或完整线路地址。
  - 从首页加载真实账号媒体库，确认得到 5 个媒体库；进入真实详情页并继续播放，播放器路由创建 1920x1080 HTML 视频对象。
  - 敏感值扫描确认当前源码和文档不再包含测试账号、密码或完整真实线路域名。
- **结果**：通过；Electron/Web Preview 的手动测活现在与 Tauri 一样会驱动自动故障转移线路选择，真实服务器主路径回归正常。
