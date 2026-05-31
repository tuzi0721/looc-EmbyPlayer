# 2026-05-29 02:42 - Electron 服务器字幕列表

## 本段目标
- 让 Electron 路径下的字幕面板能列出 Emby/Jellyfin 服务器提供的字幕轨道。
- 复用现有 mpv `sub-add` 能力，点击服务器字幕即可作为外部字幕加载。

## 变更
- Electron 主进程在 mpv 成功加载播放源后记录当前播放会话，包括 server、account、item、playSession 和 mediaSource。
- Electron `list_subtitles` 从空实现改为按当前播放会话返回服务器字幕列表。
- Electron Emby 客户端新增 `playbackInfo` 与 `listSubtitles`，从当前 mediaSource 的 `MediaStreams` 中筛出 Subtitle 轨道。
- 字幕 URL 支持服务端 `DeliveryUrl` 与标准 `Videos/{itemId}/{mediaSourceId}/Subtitles/{index}/Stream.{fmt}` 两种路径。
- 字幕格式按 codec 映射到 `ass`、`srt`、`vtt`、`sup`，并保留语言、显示标题、默认/强制/外挂标记。
- 停止播放或对应 playSession 上报停止后会清空当前字幕会话，避免字幕面板拿到上一条播放的字幕。

## 验证
- 通过 `node --check electron/backend/emby.mjs`。
- 通过 `node --check electron/main.mjs`。
- 通过 `npm.cmd run build`。
- 通过修改文件行尾空白检查。
- 通过 `npm.cmd run electron:build`，产物目录为 `release-electron\win-unpacked`。
