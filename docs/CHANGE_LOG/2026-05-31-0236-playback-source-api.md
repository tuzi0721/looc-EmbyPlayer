# 2026-05-31 02:36 播放源候选 API 与指定源开流

## 目标

先把播放器“播放线路 / 媒体源切换”的后端能力落地：`PlaybackInfo` 不再只被折叠成一个默认播放源，Electron 可以返回真实候选媒体源和线路，并可按指定 `lineId` / `mediaSourceId` 重新开流。

## 变更

- Electron `get_playback_source` payload 新增 `lineId`、`mediaSourceId`，返回值新增当前线路、线路候选和 `MediaSources` 候选摘要。
- Electron `play` / mpv 播放链支持传入 `lineId`、`mediaSourceId`，播放请求串行 key 与播放日志同步记录这两个选择，避免切源请求被误判为重复播放。
- Electron 字幕列表读取会沿用当前播放会话的线路，避免切到备用线路播放后字幕仍从全局 active line 拉取。
- 前端 API 类型与 player store 播放 payload 增加播放线路 / 媒体源字段。
- Tauri `play` / `play_external` payload 先兼容 `mediaSourceId`，可按指定媒体源选择 `PlaybackInfo.MediaSources`。

## 验证

已通过：

```powershell
node --check electron\backend\emby.mjs
node --check electron\main.mjs
npm.cmd run check:electron-commands
```

结果：Electron 命令覆盖检查通过，当前 86 个 renderer 命令全部被 82 个 Electron handler 与 4 个显式 embed no-op 覆盖。

## 当前状态

- 后端/API 已能提供播放媒体源与线路候选，并支持指定候选重新开流。
- 播放器 UI 尚未接入候选选择入口，下一小段继续做播放器内切换面板。
