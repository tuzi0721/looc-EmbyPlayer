# 2026-06-02 04:22 - 亮色主题与通知清理
## 变更

- 修复 Windows 下亮色主题仍使用深色侧栏/顶栏的问题：Windows WebView2 的无模糊降级背景改为读取主题变量，亮色下侧栏、顶栏、薄玻璃层、滚动条和通知抽屉都使用浅色可读配色。
- 通知清空改为后端持久化语义：清空时记录 `notificationsClearedAt` 和带 `sourceId` 的通知来源键，重复的下载/来源通知不会在重新登录或旧状态导入后再次出现。
- 通知入库增加来源去重：同一 `category + sourceId + kind + title + action` 只保留一条，避免同一个下载终态反复堆积。
- Electron 首页 smoke 增加亮色主题断言，检查侧栏/顶栏背景已变亮、文字变量已变暗。
- 新增 `scripts/check-notification-clear.mjs`，覆盖“清空后同源通知不复活、重启 store 后仍不复活、新来源仍可通知”的状态契约。

## 验证

- `node --check electron\backend\store.mjs`
- `node --check electron\main.mjs`
- `node --check scripts\smoke-electron-home-hero.mjs`
- `node scripts\check-notification-clear.mjs`
- `npm.cmd run build`
- `npm.cmd run check:electron-commands`
- `node scripts\smoke-electron-home-hero.mjs`
- `git diff --check`
