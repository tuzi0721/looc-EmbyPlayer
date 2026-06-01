# 2026-06-02 07:40 视觉与播放回归通过

## 覆盖问题
- 首页巨幕在小窗口下保持固定横幅比例，并露出继续观看与媒体库第一排。
- 详情页按参考图进入全屏壳层，不再显示主侧栏和顶栏。
- 播放器点击播放后不再黑屏，底部进度条、后退按钮、播放按钮、全屏按钮和 resize 后布局均可见。
- 播放链路继续禁止服务端转码，确认使用本机直连/直流。

## 验证
- `node --check scripts\smoke-electron-home-hero.mjs`
- `npm.cmd run build`
- `node scripts\smoke-electron-home-hero.mjs`
- `node scripts\smoke-electron-embedded-local.mjs`
- `cmd /c "set HILLS_SMOKE_KEEP_ARTIFACTS=1&& node scripts\smoke-electron-embedded-local.mjs"`

## 人工视检
- 已检查 `C:\Users\Sakur\AppData\Local\Temp\hills-lite-home-hero-1780357002061\home-hero.png`。
- 已检查 `C:\Users\Sakur\AppData\Local\Temp\hills-lite-home-hero-1780357002061\home-compact.png`。
- 已检查 `C:\Users\Sakur\AppData\Local\Temp\hills-lite-home-hero-1780357002061\detail-hero.png`。
- 已检查 `C:\Users\Sakur\AppData\Local\Temp\hills-lite-embedded-local-1780357106065\embedded-local.png`。

## 结果
- 首页/详情 smoke: `ok=true`，详情页 `appSidebarVisible=false`、`topbarVisible=false`、hero `x=0`、`y=0`。
- 播放 smoke: `ok=true`，`functionalOk=true`，`screenPixelsOk=true`，`runtimeCleanup.ok=true`，`localDecodeContract.ok=true`。
