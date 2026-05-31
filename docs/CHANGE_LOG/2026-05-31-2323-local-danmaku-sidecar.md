# 本地同名 XML 弹幕自动关联

- **时间**：2026-05-31 23:23 (UTC+8)
- **动机**：文件源目标里“自动关联字幕 / 弹幕”还剩弹幕侧；播放器已支持手动导入 XML，本地视频播放时应能自动尝试同名 XML。
- **修改文件**：
  - `src/views/PlayerView.vue` — 本地文件播放成功后依次尝试 `同名.xml`、`同名.danmaku.xml`、`同名.comments.xml`，解析到有效弹幕后自动开启弹幕。
  - `src/views/PlayerView.vue` — 手动导入 XML 与自动导入共用 `applyDanmakuResult()`；切换本地文件时清空旧弹幕，避免上一部的弹幕残留到下一部。
- **风险**：当前只尝试固定同名 XML 候选，不扫描目录、不递归、不做语言/剧集匹配；没有 XML 或 XML 为空时保持无弹幕状态。
- **回滚**：移除本地播放后的 `autoImportLocalDanmakuXml()` 调用，并把手动 XML 导入恢复为原来的内联赋值即可。
- **验证步骤**：
  - `npm.cmd run build`
  - `git diff --check`
  - `npm.cmd run electron:build`
- **结果**：通过；前端类型检查和 Electron unpacked 包完整性检查通过。
