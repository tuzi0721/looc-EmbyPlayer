# Web Preview 窗口命令兜底

- **时间**：2026-06-01 07:48 (UTC+8)
- **动机**：播放器顶部“置顶”按钮在 Electron/Tauri 有真实窗口后端，但 Web Preview 中点击会落入未实现命令错误，干扰浏览器预览播放回归。
- **修改文件**：
  - `src/platform/index.ts`：Web Preview fallback 对 `set_always_on_top` 返回成功 no-op，对 `set_secondary_display_blackout` 返回 `{ count: 0 }`。
- **风险**：Web Preview 不具备真实窗口置顶和副屏遮罩能力，本阶段只避免预览环境误报错误；桌面 Electron/Tauri 行为不变。
- **回滚**：移除新增两个 fallback case，让 Web Preview 继续对这些窗口命令报未实现。
- **验证步骤**：
  - `npm.cmd run build`
  - `git diff --check`
  - in-app Browser 打开真实播放页，点击“置顶”按钮，确认按钮切到“取消置顶”且页面未出现 `Web preview does not implement command` 错误。
- **结果**：通过；Web Preview 播放回归中点击置顶不再产生假错误。
