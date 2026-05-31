# 画质增强能力面板

- **时间**：2026-05-31 21:26 (UTC+8)
- **动机**：M5 里 HDR / VSR / FSR / RIFE / shader 还没有真实后端能力，继续放成可开关入口会误导用户；先用只读能力状态把可用与待接入边界说清。
- **修改文件**：
  - `src/views/SettingsView.vue` — 新增“画质增强”设置面板，展示 Windows HDR、RTX VSR、RTX TrueHDR、AMD FSR、RIFE、GLSL Shaders 的当前状态。
- **风险**：当前只展示能力状态，不启用任何增强算法；Web Preview 下 Windows HDR 会按平台显示禁用，Electron/Windows 下提供系统显示设置入口。
- **回滚**：撤回 `SettingsView.vue` 中面板、计算属性和样式即可恢复原设置页结构。
- **验证步骤**：
  - `npm.cmd run build`
  - `git diff --check`
  - in-app Browser 点击设置页“画质增强”
  - `npm.cmd run electron:build`
- **结果**：通过；浏览器目检确认面板显示 6 个能力项，Web Preview 下 Windows HDR 为禁用，其余增强项为待接入，页面错误数为 0；Electron unpacked 包完整性检查通过。
