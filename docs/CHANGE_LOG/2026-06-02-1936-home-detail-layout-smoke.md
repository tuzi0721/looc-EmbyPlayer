# 2026-06-02 19:36 Home/detail layout smoke

## 背景
- 用户真实截图指出首页最大化后巨幕过窄、右侧大面积空白，详情页背景和内容分布仍像空黑屏。
- 上一阶段只闭合了 Electron 默认 native child 宿主和 smoke 证据门槛，尚未证明首页/详情视觉已经可用。

## 改动
- 首页巨幕背景改为真实 `<img>`，支持按候选图逐级 fallback，并把账号 ID 传给 Electron 图片缓存协议。
- 首页 cinema 巨幕保留固定比例，低高度桌面和窄短窗口按可用高度反推宽度，确保继续观看和媒体库在首屏露出。
- 详情页背景同样使用真实 `<img>` fallback，并调轻遮罩，避免有图时仍被压成整块黑屏。
- 本地 home hero smoke 更新为检查真实图片加载、首页下一段可见、详情页下方内容露出、无额外右侧海报，以及多服务器收藏/历史/搜索路径。

## 验证
- `node --check scripts\smoke-electron-home-hero.mjs`
- `node --check scripts\real-server-visual-smoke.mjs`
- `node --check scripts\smoke-electron-embedded-local.mjs`
- `npm.cmd run build`
- `node scripts\smoke-electron-home-hero.mjs`

本地 Electron 视觉 smoke 输出 `ok: true`，保留截图：
- `C:\Users\Sakur\AppData\Local\Temp\hills-lite-home-hero-1780400133363\home-hero.png`
- `C:\Users\Sakur\AppData\Local\Temp\hills-lite-home-hero-1780400133363\home-compact.png`
- `C:\Users\Sakur\AppData\Local\Temp\hills-lite-home-hero-1780400133363\detail-hero.png`

关键测量：首页 hero 比例约 `2.6667`，无右侧额外海报；1264x761 下下一段可见 `134.5px`；详情页 hero 高度 `563.125px`，下方内容可见 `48.09375px`；1366x768 低高度桌面下媒体库卡片完整可见；760x430 窄短窗口下媒体库段落已露出。

## 下一步
- 立即用真实测试账号、真实服务器、多尺寸窗口重跑 visual smoke。
- 真实播放必须继续满足 `mode=wid`、`hostKind=native-child`、app-owned child `hwnd`、5 秒延迟截图和本机 DirectPlay/DirectStream 解码契约；如果 mpv 仍外置、黑屏或泄漏，视为未通过并继续修。
