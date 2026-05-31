# AI 字幕能力面板

- **时间**：2026-05-31 21:46 (UTC+8)
- **动机**：M5 的 Whisper / AI 字幕还没有真实后端。播放器 Stats 的 Whisper 页此前显示“未运行 / 0s / 0 段”，容易让用户误以为已有任务队列；本阶段先把 UI 改成明确的能力状态，不伪造转写能力。
- **修改文件**：
  - `src/views/PlayerView.vue` — Whisper Stats 页改为展示本地 Whisper、API 字幕、GPU 加速和 AI 翻译的待接入/未配置状态。
  - `src/views/SettingsView.vue` — 新增“AI 字幕”只读能力面板，列出 Whisper 本地转写、Whisper API、CUDA / Vulkan、AI 翻译和 DTW 时间戳状态。
- **风险**：当前只展示能力边界，不启动转写任务、不配置模型、不保存 API Key；后续接入真实后端时需要替换这些状态来源。
- **回滚**：撤回 `SettingsView.vue` 的 AI 字幕面板，并把 `PlayerView.vue` 的 Whisper Stats 行恢复即可。
- **验证步骤**：
  - `npm.cmd run build`
  - `git diff --check`
  - in-app Browser 打开 1421 干净 dev server 并点击设置页“AI 字幕”
  - `npm.cmd run electron:build`
- **结果**：通过；AI 字幕面板显示 5 个能力项且均为待接入，1421 页面无新增 console error，Electron unpacked 包完整性检查通过。
