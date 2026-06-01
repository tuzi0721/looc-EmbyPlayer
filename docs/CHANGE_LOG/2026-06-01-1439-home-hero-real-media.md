# 首页巨幕真实媒体条目

- **动机**：用户反馈首页巨幕没有真正落地，应该从媒体库已有资源中提取剧集/影片介绍和海报图；当前比例偏小且下方留白明显。
- **变更**：
  - `library` store 新增 `heroItems`，首页刷新时单独拉取真实电影、剧集和单集条目。
  - `HeroCarousel` 不再把媒体库视图卡片混入巨幕候选池，而是使用真实媒体条目，并以继续观看作为兜底。
  - 巨幕背景优先使用 Backdrop，缺失时回退 Primary。
  - 巨幕右侧新增真实 Primary 海报图，标题、简介和巨幕高度同步放大。
  - 未登录首页空状态文案改为指向设置页服务器面板。
- **验证**：
  - 通过：`npm.cmd run build`
  - 通过：`npm.cmd run electron:build`
  - 通过：`git diff --check`
  - 通过：代码路径检查确认巨幕候选来自 `lib.heroItems`。
  - 通过：构建后未发现 `Hills Lite`、`emby-player`、`mpv` 或 `electron_mpv_host` 残留进程。
  - 未完成：in-app Browser 当前无可用通道，本轮未做截图目检。
- **结果**：通过；首页巨幕现在由真实媒体条目驱动，能展示媒体介绍、背景图和海报图。
