# 本机解码合同 smoke

## 背景

用户明确要求解码必须由本机完成，不能把视频或音频解码/转码压力交给 Emby/Jellyfin 服务端。服务端常见运行环境可能只是 NAS、路由器或低核心 VPS，一旦客户端请求服务端转码，会导致服主封禁或服务端过载。

## 变更

- 增强 `scripts/smoke-electron-embedded-local.mjs`：
  - 假 Emby 服务端记录实际收到的 `PlaybackInfo` 请求 query 与 body。
  - 记录实际静态流请求。
  - 记录播放进度上报。
  - 新增本机解码合同断言：
    - `EnableDirectPlay=true`
    - `EnableDirectStream=true`
    - `EnableTranscoding=false`
    - `EnableVideoStreamCopy=true`
    - `EnableAudioStreamCopy=true`
    - `DeviceProfile.TranscodingProfiles=[]`
    - 播放 URL 必须包含 `Static=true`
    - 进度上报的 `PlayMethod` 只能是 `DirectPlay` 或 `DirectStream`

## 验证

- 通过：`node --check scripts\smoke-electron-embedded-local.mjs`
- 通过：`npm.cmd run check:local-decode`
- 通过：`node scripts\smoke-electron-embedded-local.mjs`
  - `localDecodeContract.ok=true`
  - `playbackInfoRequestCount=1`
  - `streamRequestCount=3`
  - `playstateReportCount=16`
  - 播放后退、长按倍速、真全屏、窗口自适应、mpv 截图像素和退出清理同时通过。

## 风险

- 该 smoke 使用本地假 Emby 服务端验证播放合同，不连接真实服务器，也不输出真实账号、token、线路或播放 URL。
- 如果真实服务器本身没有返回可本机直连或直流的媒体源，客户端应拒绝播放，而不是请求服务端转码。

## 回滚

- 还原 `scripts/smoke-electron-embedded-local.mjs` 中的本机解码合同采集和断言即可。
