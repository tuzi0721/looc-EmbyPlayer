# 2026-06-02 04:00 - 收藏/历史卡片尺寸与图片回退

## 变更

- 收藏页、历史页和聚合视界中的个人媒体卡统一使用横向 Backdrop 比例，避免电影竖海报与剧集横图在同一网格中混排造成尺寸不齐。
- `PosterCard` 增加多级图片候选：优先使用自身 Backdrop，缺失时回退到剧集/系列 Backdrop、自身 Primary 和系列 Primary，减少剧集卡片空白灰块。
- 图片代理请求继续携带条目来源账号，跨服务器个人记录取图不会错误复用当前激活服务器。
- 双服务器 Electron smoke 增加“缺 Backdrop 但有 Primary”的假媒体，断言收藏、历史、聚合视界的卡片图片均成功解码。

## 验证

- `node --check scripts\smoke-electron-home-hero.mjs`
- `npm.cmd run build`
- `node scripts\smoke-electron-home-hero.mjs`
- `git diff --check`
