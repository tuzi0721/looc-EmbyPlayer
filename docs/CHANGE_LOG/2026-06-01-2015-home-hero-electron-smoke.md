# 2026-06-01 20:15 首页巨幕 Electron 回归

## 背景

in-app Browser 当前没有可用路由，无法做普通浏览器截图目检。首页巨幕又必须验证真实首屏尺寸、媒体库候选、简介和海报图来源，因此本阶段补一个桌面 Electron smoke，用本地假 Emby 返回可控媒体库数据并在真实桌面壳里检查首页。

## 变更

- 新增 `scripts/smoke-electron-home-hero.mjs`。
- smoke 启动本地假 Emby，返回媒体库、继续观看、电影 / 剧集候选、Primary 海报与 Backdrop 图。
- smoke 通过 Electron CDP 登录本地假账号、进入 `/home`、刷新首页数据，并检查巨幕标题、简介、Backdrop URL、海报尺寸、Hero 高度和下一段内容露出。

## 验证

- `node --check scripts\smoke-electron-home-hero.mjs`
- `npm.cmd run check:no-planned-ui`
- `npm.cmd run dev`
- `node scripts\smoke-electron-home-hero.mjs`
- `git diff --check`

## 结果

- smoke 返回 `ok: true`。
- 视口为 `1266x763`，Hero 为 `1036.8x691.2`，底部位于 `735.2px`。
- 下一段内容 `nextSectionTop = 735.2px`，确认首屏仍能露出后续区域。
- 海报为 `278.6x417.9`，标题和简介来自本地假 Emby 媒体库候选。
- Backdrop 使用 `hills-image://media/.../Backdrop?width=2200...`，确认巨幕请求媒体库图片而非静态占位。
- 验证结束后已停止本轮 dev server，避免后台端口残留。
