# 2026-05-31 07:04 Electron release 随包 mpv 真实播放冒烟

## 目标

在不持久化测试账号凭据的前提下，用 Electron release 产物里的随包 `mpv.exe` 打开真实线路1媒体，确认播放源不只是能构造 URL，而是能被 mpv 实际加载并播放。

## 验证

已通过脱敏联网播放冒烟：

```powershell
@'
<redacted real playback smoke>
'@ | node --input-type=module -
```

结果：

- 登录成功，未把访问 token、密码、鉴权 header 或完整播放 URL 写入仓库文档。
- `resolveMpv()` 命中 `release-electron\win-unpacked\resources\mpv\mpv.exe`，确认使用 Electron release 随包 mpv。
- 测试条目 `21648` 在线路1返回 `mediaSourceId = mediasource_21648`。
- 播放源摘要为 `streamKind = mpv-direct-static`、`sourceKind = direct-stream`。
- `mpv.load()` 返回 accepted。
- mpv IPC 快照确认媒体已打开并前进：
  - `positionMs = 1250`
  - `durationMs = 866026`
  - `trackCount = 4`
  - `videoCodec = H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10`
  - `audioCodec = AAC (Advanced Audio Coding)`
  - `paused = false`
  - `eof = false`
  - `buffering = false`
  - `hwdecCurrent = d3d11va`

## 结论

- Electron release 随包 mpv、真实线路1、真实媒体、鉴权 header 与后端播放源构造已经完成端到端冒烟。
- 线路2仍受上游 Cloudflare 403 限制，本轮没有把该限制当成客户端代码缺陷处理。
