# 2026-06-02 04:44 - 首页 compact 布局一致性
## 变更

- 首页 cinema 巨幕高度改为按 `100dvh` 与顶栏空间收敛，缩小窗口时不再保留过高的固定最小高度。
- 低高度桌面窗口下收紧巨幕标题字号、内容区底部间距和简介行数，让首屏仍能看到下一段内容提示。
- 首页 smoke 新增 960×600 compact 窗口检查，断言巨幕存在、底部不越过 viewport、下一段内容露出、标题不过大且页面无横向溢出。
- 修复 smoke 在多服务器搜索后直接回首页时没有清空 `searchResults` 的状态污染，避免误把搜索结果页当成首页巨幕缺失。

## 验证

- `node --check scripts\smoke-electron-home-hero.mjs`
- `npm.cmd run build`
- `node scripts\smoke-electron-home-hero.mjs`
- `git diff --check`
