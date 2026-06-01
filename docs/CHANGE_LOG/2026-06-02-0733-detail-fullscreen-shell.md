# 2026-06-02 07:33 详情页壳层全屏

## 背景
- 用户对比参考图后确认：剧集/媒体详情页需要像参考详情页一样铺满窗口，而不是只在常规应用壳层里渲染一个全高 hero。
- 上一轮视觉 smoke 已证明详情 hero 本身是全高，但人工视检发现左侧栏和顶栏仍包在详情页外侧。

## 改动
- 将 `/item/:id` / `item-detail` 标记为 fullscreen route。
- 详情页现在隐藏主侧栏和顶栏，使用自身的返回按钮退出详情页，壳层行为与播放器路由一致。

## 待验证
- 重新运行 `npm.cmd run build`。
- 重新运行 `node scripts\smoke-electron-home-hero.mjs`，并人工检查生成的首页、紧凑首页和详情页截图。
- 重新运行 `node scripts\smoke-electron-embedded-local.mjs`，确认播放器路由、控制条和可见画面未被详情页壳层改动影响。
