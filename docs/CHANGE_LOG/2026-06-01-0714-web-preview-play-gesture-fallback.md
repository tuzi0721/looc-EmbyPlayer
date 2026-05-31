# Web Preview 播放手势兜底

- **时间**：2026-06-01 07:14 (UTC+8)
- **动机**：真实服务器回归中发现 Web Preview 播放器已经拿到真实 HTML video 对象和首帧数据，但自动化点击播放按钮后时间不推进；需要避免浏览器把播放请求判定为缺少用户手势时卡在 0 秒。
- **修改文件**：
  - `src/views/PlayerView.vue`：HTML/HLS 播放的显式播放按钮新增 `NotAllowedError` 兜底，首次 `video.play()` 被拒绝时自动切到静音并重试，同时同步静音状态和错误提示。
  - `docs/CURRENT_STATE.md`：记录本轮真实播放启动回归结果。
  - `docs/CHANGE_LOG/2026-06-01-0714-web-preview-play-gesture-fallback.md`：新增本阶段日志。
- **风险**：兜底仅作用于 Web Preview 的 HTML video 路径；当浏览器拒绝带声音启动时会以静音方式推进播放，用户可再手动取消静音。Electron/Tauri 内嵌 mpv 播放路径不受影响。
- **回滚**：恢复 `togglePlay()` 直接调用 `video.play()`，删除 `playHtmlVideoFromUserAction()` 和本日志即可。
- **验证步骤**：
  - `npm.cmd run build`
  - in-app Browser 1420 使用真实测试账号会话直接打开真实播放器页，点击播放按钮后，HTML video 从 `currentTime = 0` 推进到约 10 秒，`paused = false`，视频尺寸保持 1440×1080，页面无播放失败提示。
  - `git diff --check`
  - 敏感关键字扫描，确认未写入测试账号、密码、token 或完整线路地址。
  - `npm.cmd run electron:build`
- **结果**：通过；Web Preview 真实服务器播放页可以从首帧卡住状态推进到实际视频播放。
