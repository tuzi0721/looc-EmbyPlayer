# 2026-06-02 12:58 系列详情页播放入口修复

## 背景

用户现场反馈详情页点击播放不是“黑屏”，而是“根本没打开”。复查后发现已有真实 smoke 只覆盖 Movie/Episode，没有覆盖 Series 详情页。Series 详情页在集列表尚未加载完成或 `continueEpisode` 为空时，播放按钮处于可点击状态但点击后直接返回，用户体感就是空点。

## 变更

- `src/views/DetailView.vue`
  - 新增 Series 播放入口兜底：点击播放时会主动加载季和单集，并选择续播集或第一集。
  - Series 无可播放单集时显示详情页动作错误，不再静默失败。
  - 拆分播放器路由跳转逻辑，避免 `playNavigating` 内部锁挡住 Series 点击后的真实跳转。
  - 复用队列设置逻辑，Series 顶部播放和单集卡片播放保持一致。
- `scripts/smoke-electron-home-hero.mjs`
  - fake Emby 新增 Series / Season / Episodes 响应。
  - 新增 Series 详情页播放探针，等待真实 Series DOM 后点击播放，并断言进入 `/player/resume-episode`。
  - Episodes 接口加入轻微延迟，覆盖“集列表尚未完全落地时点击播放”的场景。

## 验证

- `node --check scripts\smoke-electron-home-hero.mjs` 通过。
- `npm.cmd run build` 通过。
- `node scripts\smoke-electron-home-hero.mjs` 通过：
  - 首页巨幕、亮色主题、添加服务器 UI、侧栏折叠、收藏/历史/聚合、多服务器搜索、电影详情页媒体源保持、多窗口 compact 布局仍通过。
  - 新增 Series 详情页点击播放断言通过：`/item/smoke-series` -> `/player/resume-episode...`。

## 备注

本阶段只关闭 Series 详情页“点击播放无动作”的漏洞。下一阶段继续验证 packaged exe 与真实账号真实服务器的播放器实际打开链路。
