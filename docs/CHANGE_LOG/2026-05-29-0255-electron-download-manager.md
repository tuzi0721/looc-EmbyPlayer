# 2026-05-29 02:55 - Electron 基础下载管理器

## 本段目标
- 让 Electron 路径下的下载中心不再是空列表和 unavailable 命令。
- 覆盖基础的 Emby/Jellyfin 直连下载、暂停、继续、取消、移除和本地播放。

## 变更
- 新增 `electron/backend/downloads.mjs`，负责下载任务创建、断点续写、进度事件、状态事件和本地播放。
- Electron JSON store 新增下载任务规范化、列表、读取、写入和移除方法。
- Electron `list_downloads`、`start_download`、`pause_download`、`resume_download`、`cancel_download`、`remove_download`、`play_local` 接入真实实现。
- 下载文件保存到 Electron userData 下的 `downloads` 目录，文件名会做 Windows 非法字符清理并自动加短随机后缀。
- 下载请求会复用播放源里的鉴权 headers 与 User-Agent；默认直连 mpv 播放源，保留 `preferDirect` 参数。
- 暂停/继续使用 Range 断点续写；服务器忽略 Range 时会自动从头覆盖写入。
- Electron 启动后会尝试恢复上次处于 running 状态的下载任务。
- `DownloadTask` 类型新增可选 `headers` 与 `userAgent` 字段，用于 Electron 下载恢复。

## 验证
- `node --check electron\backend\store.mjs`
- `node --check electron\backend\downloads.mjs`
- `node --check electron\main.mjs`
- `npm.cmd run build`
- `rg -n "[ \t]+$" electron\backend\store.mjs electron\backend\downloads.mjs electron\main.mjs src\types\models.ts docs\CURRENT_STATE.md docs\CHANGE_LOG\2026-05-29-0255-electron-download-manager.md`（无输出，退出码 1，表示未发现行尾空白）
- `npm.cmd run electron:build`
