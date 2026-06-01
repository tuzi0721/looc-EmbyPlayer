# 侧边栏工具入口收敛

- **时间**：2026-06-01 17:47 (UTC+8)
- **动机**：用户反馈主界面左侧功能过于杂乱，下载、通知、遥控等工具入口不应长期占用媒体浏览主导航。
- **修改文件**：
  - `src/components/common/AppSidebar.vue`：从主导航移除下载、通知、遥控入口，侧边栏保留首页、收藏、历史、聚合视界、服务器和设置。
  - `src/views/SettingsView.vue`：新增“工具”分组，集中提供下载中心、通知中心、遥控器入口；下载中心显示运行/暂停任务数，通知中心显示未读数。
- **风险**：入口位置改变会影响用户习惯，但路由和功能本身不变；下载页、通知中心和遥控器仍可从设置页进入。
- **回滚**：恢复上述两个文件即可回到旧侧边栏入口布局。
- **验证步骤**：
  - `npm.cmd run build`
  - `git diff --check`
  - 尝试 in-app Browser 目检设置页与侧边栏
  - `npm.cmd run electron:build`
- **结果**：前端构建与 Electron unpacked 打包均通过，Electron 包完整性检查确认 `app.asar`、随包 mpv 与 helper 存在；in-app Browser 本轮仍无可用路由，未完成截图目检。
