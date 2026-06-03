# 2026-06-03 17:45 详情页首屏打满

## 背景

用户反馈剧集详情页希望更接近整屏沉浸布局，而不是比例和窗口尺寸变化后显得不协调。

## 本阶段改动

- 详情页 hero 从 `min-height: clamp(560px, 74dvh, 840px)` 改为按当前窗口主区域高度计算。
- 常规窗口使用 `height: clamp(560px, calc(100dvh - var(--topbar-h)), 860px)`，让详情首屏稳定贴合可视主区域。
- 低高度窗口和移动窄屏不再强行使用 `100dvh`，改为扣除顶栏高度，避免内容被顶栏和滚动区域挤压。

## 验证

- 首次 `npm.cmd run build` 出现一次 Vite/Rollup `index.html` 绝对路径 emit 偶发失败，非 Vue/TypeScript/CSS 错误。
- 立即重跑 `npm.cmd run build` 通过。
- `git diff --check` 通过；仅提示 Windows 工作区后续可能把 LF 转为 CRLF。

## 下一步

继续推进收藏、历史、聚合视界和搜索的多服务器一致性与加载问题。
