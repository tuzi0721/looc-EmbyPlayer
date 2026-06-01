# 2026-06-01 15:44 - 服务器线路高级编辑

## 变更

- `src/views/SettingsView.vue`：服务器编辑面板移除“默认 User-Agent”字段，避免服务器级 UA 与线路级 UA 反复出现。
- `src/views/SettingsView.vue`：保存服务器编辑时固定写入 `defaultUserAgent: null`，与添加服务器的自动识别流程保持一致。
- `src/views/SettingsView.vue`：每条线路只默认展示名称、URL、启用状态；线路 User-Agent 与 Headers 收进“高级”折叠区，减少线路编辑区的视觉负担。

## 验证

- 通过：`npm.cmd run build`
- 通过：`git diff --check`，仅提示 Windows 工作区行尾转换。

## 备注

- 本阶段不引入新的播放地址策略；播放仍遵守 2026-06-01 14:33 阶段的本机解码硬约束，禁止走服务端转码。
