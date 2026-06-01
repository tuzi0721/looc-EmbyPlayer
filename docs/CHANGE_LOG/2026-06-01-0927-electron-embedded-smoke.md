# Electron 内嵌播放冒烟复核

- **时间**：2026-06-01 09:27 (UTC+8)
- **动机**：用户明确要求播放窗口必须内嵌；在修复 Git 同步后，对当前 `main` 再做一次桌面内嵌播放复核，确认不是只在文档中记录。
- **修改文件**：
  - `docs/CURRENT_STATE.md`：同步记录本次复核结果。
- **风险**：本次使用本地假 Emby 与临时彩色视频验证内嵌宿主、mpv 播放状态和窗口像素，不覆盖真实远端媒体的网络波动。
- **回滚**：本次仅更新文档，回滚对应文档记录即可。
- **验证步骤**：
  - `node scripts\smoke-electron-embedded-local.mjs`
  - `git diff --check`
  - 敏感关键字扫描，确认未写入测试账号、密码、token 或完整线路地址。
- **结果**：通过；Electron 播放器进入 `/player/local-embedded-smoke`，mpv 返回 `durationMs = 12000`、`positionMs ≈ 7300`、`trackCount = 2`、`paused = false`，屏幕截图与 mpv 截图均检测到彩色视频像素，确认当前桌面内嵌路径非黑屏。
