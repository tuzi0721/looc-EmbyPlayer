# 播放源切换当前复核

- **动机**：播放线路 / 媒体源切换已经多轮落地，但目标要求以当前工作树和真实运行状态为准，不能只依赖历史日志。
- **复核范围**：
  - 代码审计确认 Electron `get_playback_source` / `play`、player store、播放器 UI、外部播放器和 Tauri `play` / `play_external` 均保留 `lineId` / `mediaSourceId` 透传。
  - in-app Browser 当前真实会话打开设置页，确认真实服务器 `001` 已连接，主线路为当前线路，线路 2 可设为当前，页面无横向溢出。
  - in-app Browser 打开真实播放器页，用户手势播放后 HTML 视频从 0 秒推进到 6 秒，尺寸为 1440×1080，`readyState = 4`。
  - 播放源菜单在窄宽度下可见主线路、线路 2 和媒体源摘要，点击线路 2 后视频继续推进到 45 秒，重新打开菜单确认线路 2 为 active，页面无错误。
- **验证**：
  - 通过：`node --check electron\backend\emby.mjs`
  - 通过：`node --check electron\main.mjs`
  - 通过：`npm.cmd run check:electron-commands`
  - 通过：`npm.cmd run build`
  - 通过：`cargo fmt --manifest-path src-tauri\Cargo.toml --check`
  - 通过：`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
  - 通过：`npm.cmd run electron:build`
- **结果**：通过；当前工作树的播放线路 / 媒体源切换实现、构建闸门和真实 Web Preview 双线路切源验收均已复核。验证过程未写入账号、密码、token 或完整线路地址。
- **风险**：本次真实切源复核覆盖 Web Preview HTML/HLS 播放路径；Electron 桌面 mpv 真实双线路切换仍受真实线路可访问性影响，既有本地 Electron smoke 继续覆盖内嵌 mpv 非黑屏、控制栏、全屏和 resize。
