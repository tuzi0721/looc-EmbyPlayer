# 2026-06-01 19:58 退出残留回归验证

## 背景

用户反馈“无法关闭，退出应用后播放仍在进行，任务管理器也无法终止”是最高优先级问题。当前代码已经加固退出清理链路，本轮单独做一次回归验证，确认内嵌播放关闭窗口时不会留下 mpv 或宿主 helper。

## 验证

- `Get-Process -Name mpv,electron_mpv_host,'Hills Lite' -ErrorAction SilentlyContinue | Select-Object ProcessName,Id,Path`：验证前未发现本项目播放进程残留。
- `node --check scripts\smoke-electron-embedded-local.mjs`
- `node scripts\smoke-electron-embedded-local.mjs`

## 结果

- smoke 返回 `ok: true` 与 `functionalOk: true`。
- 关闭前检测到 `electron_mpv_host.exe` 与随包 `mpv.exe` 正在播放。
- 关闭后 `electronExited: true`，`remaining: []`，`runtimeCleanup.ok: true`。
- 同一轮 smoke 还确认后退从约 10.6 秒退到约 0.9 秒、全屏后 `.player__stage` 覆盖完整 viewport、960px 窄窗口无水平溢出，屏幕截图和 mpv 截图均检测到彩色视频像素。
