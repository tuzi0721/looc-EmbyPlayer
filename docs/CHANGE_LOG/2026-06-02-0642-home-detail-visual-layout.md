# 2026-06-02 06:42 首页/详情视觉验收升级

## 背景
- 用户复核截图后指出：首页小窗口下巨幕仍然过高，首屏没有稳定露出继续观看和媒体库；详情页也没有达到全屏沉浸式布局；点击播放进入黑屏的问题不能只靠旧 smoke 判定通过。

## 本阶段变更
- 首页 `HeroCarousel` 改为宽度驱动的固定横幅比例，取消以 `100dvh` 撑高巨幕的旧逻辑，让继续观看与媒体库能进入首屏视野。
- 详情页 hero 改为首屏全高背景，左下显示播放动作、标题与元信息，右下新增版本/音频/字幕选择与媒体能力面板。
- 详情页播放入口会把当前媒体源选择带入播放器路由；播放器启动时读取 `lineId` / `mediaSourceId` 并传给播放源请求。
- `scripts/smoke-electron-home-hero.mjs` 增加 compact 首页、详情页全屏 hero、右下控制面板、详情页播放媒体源参数保留的断言，并输出 compact 与详情截图路径供视检。

## 已验证
- `node --check scripts\smoke-electron-home-hero.mjs`
- `npm.cmd run build`

## 下一步
- 立即运行更新后的 Electron home/detail smoke，并打开生成截图做人工视检；随后继续排查真实点击播放黑屏。
