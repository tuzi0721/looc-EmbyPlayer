# 2026-06-02 07:37 详情页全屏 smoke 门槛

## 背景
- 人工视检发现详情页是否“打满”不能只看 hero 高度，还必须确认主应用侧栏和顶栏已经退出详情页壳层。

## 改动
- `scripts\smoke-electron-home-hero.mjs` 的详情页探针现在记录 `appSidebarVisible`、`topbarVisible` 以及 hero 的 `x/y`。
- smoke 失败条件新增：详情页仍存在主侧栏或顶栏、hero 没有从窗口原点开始铺满。

## 验证计划
- 重新运行 `node --check scripts\smoke-electron-home-hero.mjs`。
- 重新运行 `npm.cmd run build`。
- 重新运行 `node scripts\smoke-electron-home-hero.mjs`，并人工视检详情页截图。
