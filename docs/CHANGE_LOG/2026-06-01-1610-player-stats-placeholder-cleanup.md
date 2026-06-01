# 2026-06-01 16:10 - 播放器 Stats 占位分页清理

## 变更

- `src/views/PlayerView.vue`：删除播放器 Stats 面板里的 `Whisper` 占位分页。
- `src/views/PlayerView.vue`：Stats 页类型与分页选项收敛为综合、视频、音频、轨道四页，只展示已有运行时数据。
- `docs/CURRENT_STATE.md`：同步更正 Stats 当前状态，AI 字幕 / Whisper 待接入信息只保留在设置页能力面板。

## 验证

- 通过：`npm.cmd run build`
- 通过：`npm.cmd run electron:build`
- 通过：`git diff --check`，仅提示 Windows 工作区行尾转换。
- 通过：播放器 Stats 占位残留扫描，`PlayerView.vue` 不再包含 Whisper / 待接入 Stats 项。

## 备注

- 本阶段不删除设置页的 AI 字幕能力面板；该面板属于设置/路线状态，不在播放时工具面板中干扰用户。
