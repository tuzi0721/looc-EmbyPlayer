# 播放器后退与返回控制修正

- **动机**：用户反馈播放器“无法后退”；该问题可能同时涉及时间轴后退和播放页返回来源，因此本轮一起收紧播放器控制路径。
- **变更**：
  - `PlayerView` 新增统一 `seekToMs`，拖动进度条、章节跳转、自动跳过片头和后退/前进按钮都走同一套 seek 逻辑。
  - Web Preview / HTML video 路径会直接 seek 真实 `<video>`，优先使用 `fastSeek`，并同步前端播放位置；桌面路径继续走 mpv 原生 seek。
  - 播放器返回按钮会先关闭弹层、退出原生或浏览器全屏，再按来源回到本地文件夹、WebDAV、Alist 或媒体详情页，避免全屏状态挡住导航。
  - 内嵌播放 smoke 扩展了后退按钮断言，并修正对桌面原生全屏的识别与退出。
- **验证**：
  - 通过：`node --check scripts\smoke-electron-embedded-local.mjs`
  - 通过：`npm.cmd run build`
  - 通过：`node scripts\smoke-electron-embedded-local.mjs`
  - 通过：`npm.cmd run electron:build`
  - 通过：`git diff --check`
  - 通过：构建后未发现 `Hills Lite`、`emby-player`、`mpv` 或 `electron_mpv_host` 残留进程。
- **结果**：通过；桌面 smoke 中点击“后退 10 秒”后播放位置从约 10.6 秒退到约 1.4 秒，原生全屏进入/退出与 resize 检测也通过。
