# 2026-06-02 04:10 - 侧边栏折叠按钮

## 变更

- 左上角汉堡按钮改为折叠/展开侧边栏，标题按钮保留回首页能力。
- 折叠状态会保存到 `localStorage`，下次启动继续沿用用户选择。
- 折叠后侧边栏变为 64px 图标栏，导航、服务器状态点和设置入口保留，文本收起并通过 title 提供悬停提示。
- Electron home smoke 增加侧边栏折叠断言，检查 `220px -> 64px -> 220px` 的宽度变化。

## 验证

- `node --check scripts\smoke-electron-home-hero.mjs`
- `npm.cmd run build`
- `node scripts\smoke-electron-home-hero.mjs`
- `git diff --check`
