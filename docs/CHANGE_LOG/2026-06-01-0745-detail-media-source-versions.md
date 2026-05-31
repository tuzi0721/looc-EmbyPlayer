# 详情页多版本媒体源摘要

- **时间**：2026-06-01 07:45 (UTC+8)
- **动机**：播放器已经有会话级媒体源切换，但详情页媒体信息只摘要首个 MediaSource；多版本媒体在播放前缺少可扫读的容器、编码、码率和轨道概览。
- **修改文件**：
  - `src/views/DetailView.vue`：新增媒体源版本卡片，存在多个 MediaSource 时展示每个版本的容器、分辨率、视频/音频编码、码率、大小、音轨/字幕数量和播放能力。
- **规则**：版本卡不展示 Path、完整 URL 或本地文件路径；当 MediaSource 名称疑似路径或远端地址时显示为“版本 N”。
- **风险**：当前样本只有单 MediaSource，真实多版本样本待后续继续覆盖；单版本条目保持原媒体信息布局，不额外显示版本区。
- **回滚**：移除 `MediaSourceCard`、`safeMediaSourceName()`、`mediaSourceCards` 和 `.media-info__versions` 模板/CSS。
- **验证步骤**：
  - `npm.cmd run build`
  - `git diff --check`
  - in-app Browser 打开真实条目详情页，确认单版本样本不显示“全部版本”卡片，媒体信息区没有完整 URL 或 Windows 路径。
- **结果**：通过；详情页已具备多版本媒体源摘要能力，并保持单版本页面简洁。
