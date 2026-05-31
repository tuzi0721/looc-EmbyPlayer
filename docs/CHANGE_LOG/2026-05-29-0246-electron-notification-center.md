# 2026-05-29 02:46 - Electron 通知中心持久化

## 本段目标
- 让 Electron 路径下的通知中心读取真实 JSON 状态，而不是总是空列表。
- 让通知删除、已读、全部已读、清空操作跨重启持久化。

## 变更
- Electron JSON store 新增通知规范化入口，兼容 `createdAt`/`created_at` 和 `sourceId`/`source_id` 字段。
- Electron store 新增通知列表、未读计数、删除、单条已读、全部已读和清空方法。
- Electron 主进程 `list_notifications` 与 `unread_count` 改为读取持久化状态。
- Electron 主进程接入 `dismiss_notification`、`mark_notification_read`、`mark_all_notifications_read`、`clear_notifications`。
- 通知操作后会发出 `notification:dismiss`、`notification:updated`、`notification:cleared`、`notification:unread` 事件，复用现有前端 store 同步逻辑。

## 验证
- 通过 `node --check electron/backend/store.mjs`。
- 通过 `node --check electron/main.mjs`。
- 通过 `npm.cmd run build`。
- 通过修改文件行尾空白检查。
- 通过 `npm.cmd run electron:build`，产物目录为 `release-electron\win-unpacked`。
