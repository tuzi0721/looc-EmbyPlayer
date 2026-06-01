# 2026-06-02 04:05 - 首页巨幕去海报与点击进入

## 变更

- 首页巨幕移除右侧额外 Primary 海报，避免背景巨幕上再叠一张独立海报。
- 巨幕整块支持点击、Enter 和 Space 进入当前媒体详情；箭头与圆点阻止冒泡，不会误触详情跳转。
- 剧集类巨幕标题优先显示系列名，单集名与季集号放入副标题，元信息行保持类型、评分、年份和分级。
- 调整 cinema 巨幕文本宽度与字号，去掉右侧海报后让文字区在桌面和窄窗口下更稳定。
- 首页 smoke 更新为断言无右侧海报、巨幕点击可进入详情，同时保留首屏露出下一段内容的检查。

## 验证

- `node --check scripts\smoke-electron-home-hero.mjs`
- `npm.cmd run build`
- `node scripts\smoke-electron-home-hero.mjs`
- `git diff --check`
