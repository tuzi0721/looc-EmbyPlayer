# 2026-06-01 19:21 播放信息探测本机解码收紧

## 背景

用户补充明确约束：解码必须由本机完成，不能把 Emby/Jellyfin 服务端当作转码/解码兜底。NAS、路由器、低核 VPS 以及大服资源机都不能承受服务端解码压力，播放链路必须始终避免触发服务端转码。

## 变更

- Electron 后端通用 `playbackInfo()` 探测补齐 `EnableDirectPlay=true`、`EnableDirectStream=true`、`EnableTranscoding=false`、视频/音频 stream copy 开关与 Direct only `DeviceProfile`。
- 该探测主要供字幕列表等辅助路径使用；现在即使不是主播放源获取，也不会给服务端转码协商留下默认空间。
- `check:local-decode` 新增函数块级锚点检查，要求 Electron 的 `playbackInfo()`、`playbackSource()` 与 Web Preview 的 `webPlaybackSource()` 都显式保留 Direct only 参数、静态流 URL 与 `serverTranscodingAllowed: false` 诊断。

## 验证

- `node --check electron\backend\emby.mjs`
- `node --check scripts\check-local-decode-guard.mjs`
- `npm.cmd run check:local-decode`
