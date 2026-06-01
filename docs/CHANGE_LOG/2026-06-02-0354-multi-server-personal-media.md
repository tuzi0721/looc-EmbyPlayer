# 2026-06-02 03:54 - 多服务器收藏/历史/搜索来源闭环

## 变更

- Electron 新增 `list_items_all_accounts`、`resume_items_all_accounts`、`search_all_accounts`，收藏、历史、聚合视界与搜索不再只读取当前激活账号。
- 媒体条目增加 `_source` 来源上下文，前端列表 key 使用 `serverId + accountId + itemId`，允许不同服务器出现同名甚至同 ID 的记录。
- 从收藏、历史、聚合视界和首页搜索点进条目时，会先切换到该条目所属账号，再进入详情页，保证后续播放走对应服务器。
- 海报代理路径支持携带账号来源，`PosterCard` 会优先使用条目的来源服务器取图，并显示来源服务器名，便于区分同名记录。
- `scripts/smoke-electron-home-hero.mjs` 扩展为双服务器 smoke：两个假 Emby 返回同名同 ID 媒体，断言收藏、历史、聚合视界和搜索均保留跨服务器记录。

## 验证

- `node --check electron\main.mjs`
- `node --check scripts\smoke-electron-home-hero.mjs`
- `npm.cmd run build`
- `npm.cmd run check:electron-commands`
- `node scripts\smoke-electron-home-hero.mjs`
- `git diff --check`
