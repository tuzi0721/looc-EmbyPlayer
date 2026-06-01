# 服务端解码 stream copy 门禁

## 背景

用户再次强调：解码必须由本机完成，不能让 Emby/Jellyfin 服务端解码。大量私人服务端只是 NAS、路由器或低核 VPS，即使更强的独服在服务端解码时也可能出现不可接受的 CPU 占用，诱发封禁。

## 变更

- `scripts/check-local-decode-guard.mjs` 新增禁用视频/音频 stream copy 的失败规则：`EnableVideoStreamCopy=false`、`EnableAudioStreamCopy=false`、`enable_video_stream_copy: false` 与 `enable_audio_stream_copy: false` 都会被拦截。
- Electron、Web Preview 与 Tauri 的 PlaybackInfo 请求新增函数块锚点，要求 Direct Play、Direct Stream、禁转码、视频 stream copy、音频 stream copy 和 Direct-only 设备档案同时存在。
- `docs/CURRENT_STATE.md` 同步记录：播放策略是宁可失败提示，也不让服务端承担视频/音频解码。

## 验证

- 通过：`node --check scripts\check-local-decode-guard.mjs`
- 通过：`npm.cmd run check:local-decode`
- 通过：`npm.cmd run build`
- 通过：`git diff --check`
- 通过：构建后未发现 `mpv.exe`、`electron_mpv_host.exe` 或 `Hills Lite` 残留进程。

## 风险

- 该门禁会拒绝只靠服务端转码或禁用 stream copy 才能播放的媒体源；这是符合当前产品策略的行为。
