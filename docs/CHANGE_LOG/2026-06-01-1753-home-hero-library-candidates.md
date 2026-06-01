# 2026-06-01 17:53 首页巨幕真实媒体候选增强

## 目标
- 修正首页巨幕“没有真正调取媒体库资源、比例偏小、下方留白过大”的体验问题，让首屏巨幕优先展示当前账号媒体库里的电影 / 剧集内容，并尽量带出简介与海报图。

## 改动
- `src/stores/library.ts`
  - 首页巨幕候选优先请求 `Movie,Series`，只在没有候选时回退 `Movie,Series,Episode`。
  - 显式请求 `Overview`、年份、评分、播放状态、运行时长、`Primary` 与 `Backdrop` 图片字段。
  - 对候选做视觉优先过滤，优先使用带 Backdrop、Primary 或简介的条目，避免纯空数据占据巨幕。
- `src/components/common/HeroCarousel.vue`
  - 放大 `cinema` 巨幕高度、标题、简介和右侧海报比例。
  - 调整内容定位，减少第一屏底部空白，同时保留下方继续观看区域的露出感。

## 验证
- 通过：`npm.cmd run build`
- 通过：`git diff --check`
- 通过：`npm.cmd run electron:build`
- 通过：`Invoke-WebRequest -UseBasicParsing http://127.0.0.1:1420/` 返回 HTTP 200。
- 待补：in-app Browser 本轮仍返回无可用路由，未能完成真实首页视觉截图复核。

## 回滚
- 回退本日志对应的 `library.ts` 巨幕候选查询逻辑，以及 `HeroCarousel.vue` 的 `cinema` 尺寸调整即可。
