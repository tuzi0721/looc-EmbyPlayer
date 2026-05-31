# 2026-05-29 09:40 - 播放器快退快进按钮
## 本段目标
- 在播放器底栏补齐可见的短距离 seek 操作，让鼠标/触控用户不用依赖键盘快捷键也能快速回看或跳过一小段内容。

## 变更
- 播放器底栏播放按钮两侧新增“后退 10 秒”和“前进 30 秒”图标按钮。
- 新按钮复用已有 `nudgeSeek` 逻辑，HTML video fallback 与 mpv 路径都会走现有 seek 分支。
- 队列上一集/下一集按钮仍保留在外侧，播放、短 seek、队列切换的语义分层更清楚。

## 验证
- `npm.cmd run build` 通过；仍仅有既有 PlayerView chunk 体积警告。
- `rg "[ \t]+$" src\views\PlayerView.vue` 无输出。
- `npm.cmd run electron:build` 通过；仍仅有既有 PlayerView chunk 体积、electron-builder author/duplicate dependency、DEP0190 警告。
- 本轮未做真实播放中的按钮点击人工实测；已完成类型、构建和 Electron 打包验证。
