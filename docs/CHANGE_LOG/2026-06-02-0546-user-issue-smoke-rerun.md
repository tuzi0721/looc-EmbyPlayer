# 2026-06-02 05:46 - 用户问题清单 smoke 复核

## 范围

对用户列出的首页巨幕、跨服务器收藏/历史/搜索、卡片图片回退、窗口自适应、侧边栏折叠、亮色主题、通知清空和播放器控制条问题做自动化复核。本阶段不改代码，只确认最新提交后的实际行为。

## 验证

- `node --check scripts\smoke-electron-home-hero.mjs`
- `node scripts\smoke-electron-home-hero.mjs`

## 结果

- 首页巨幕来自媒体库候选，Logo 艺术标题图加载成功，简介来自媒体库 Overview，右侧额外海报不存在。
- 巨幕点击进入 `/item/hero-movie`，compact 窗口 `944x561` 下巨幕不横向溢出，下一段内容仍露出。
- 收藏、历史、聚合视界均保留跨服务器来源标签，同名同 ID 不同服务器记录未被合并。
- 搜索返回 2 条跨服务器同名同 ID 结果，来源分别为 `Home Hero Smoke` 和 `Existing Smoke Server`。
- 收藏、历史、聚合卡片图片回退均成功加载；历史卡片为 3 条，收藏卡片为 2 条，聚合卡片为 6 条。
- 亮色主题下侧栏和顶栏为浅色，文字为深色；侧边栏汉堡按钮可折叠到 64px 并恢复到 220px。

## 后续

- Electron 启动日志仍会出现默认 `MediaTrackNext` / `MediaTrackPrevious` 注册失败警告，下一阶段清理默认快捷键值，减少 smoke 噪声。
