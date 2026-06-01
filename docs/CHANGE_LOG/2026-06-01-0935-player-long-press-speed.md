# 播放器长按倍速

- **时间**：2026-06-01 09:35 (UTC+8)
- **动机**：播放器路线中还有“长按倍速”体验未落地；用户在观看时需要一种不打开菜单、不改持久倍速的临时加速方式。
- **修改文件**：
  - `src/views/PlayerView.vue`：在播放器画面空白区域长按时临时切到 2.0x，松开后恢复原倍速；控件、进度条、菜单和错误浮层不会触发该手势。
  - `scripts/smoke-electron-embedded-local.mjs`：扩展 Electron 内嵌 smoke，模拟按住画面并断言 mpv speed 从 1.0 到 2.0 再恢复。
  - `docs/CURRENT_STATE.md`：同步记录本阶段结果。
- **风险**：长按手势可能与拖动/误触接近；实现已在指针移动超过阈值时取消未触发的长按，并避开控件区域。
- **回滚**：移除 `PlayerView` 中的长按倍速状态、指针事件与 `2.0x` 徽标，并还原 smoke 中的长按断言即可。
- **验证步骤**：
  - `npm.cmd run build`
  - `node --check scripts\smoke-electron-embedded-local.mjs`
  - `node scripts\smoke-electron-embedded-local.mjs`
  - `git diff --check`
  - 敏感关键字扫描，确认未写入测试账号、密码、token 或完整线路地址。
- **结果**：通过；Electron 内嵌 smoke 中按住播放器画面后 `speed = 2` 且 `2.0x` 徽标可见，松开后恢复 `speed = 1` 且徽标消失。
