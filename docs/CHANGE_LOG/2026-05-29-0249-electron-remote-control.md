# 2026-05-29 02:49 - Electron 远程遥控

## 本段目标
- 让 Electron 路径下的“遥控”页面能看到同一 Emby/Jellyfin 服务器上的其他在线会话。
- 让播放暂停、停止、快退快进、进度跳转、音量和发送消息等远程命令不再是 no-op。

## 变更
- Electron Emby 客户端新增远程会话规范化，映射设备、用户、客户端版本、播放状态和 NowPlayingItem。
- Electron `list_remote_sessions` 接入服务器 `Sessions` API，并过滤掉 Hills Lite 自己的设备会话。
- Electron `remote_playstate` 接入 `Sessions/{id}/Playing/{command}`，支持 SeekPositionTicks。
- Electron `remote_play` 接入 `Sessions/{id}/Playing`，支持 PlayNow 与 StartPositionTicks。
- Electron `remote_set_volume` 接入 GeneralCommand `SetVolume`，音量限制在 0 到 100。
- Electron `remote_display_message` 接入 GeneralCommand `DisplayMessage`，默认显示 5 秒。
- 远程命令从 Electron no-op 集合中移除，避免后续误判为未迁移。

## 验证
- 通过 `node --check electron/backend/emby.mjs`。
- 通过 `node --check electron/main.mjs`。
- 通过 `npm.cmd run build`。
- 通过修改文件行尾空白检查。
- 通过 `npm.cmd run electron:build`，产物目录为 `release-electron\win-unpacked`。
