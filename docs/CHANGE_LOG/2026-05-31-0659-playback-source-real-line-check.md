# 2026-05-31 06:59 真实线路播放源验证

## 目标

用真实测试账号和真实媒体验证 Electron 后端的播放线路 / 媒体源选择能否构造 mpv 可用播放源，并确认线路2失败时的边界是不是代码内可修复问题。

## 验证

已完成脱敏联网验证：

```powershell
node --input-type=module -e "<redacted real-line playback source smoke>"
```

结果：

- 登录成功，验证过程中未把访问 token、密码或完整播放 URL 写入仓库文档。
- 线路1 `https://ciallo.party/` 可完成 `PlaybackInfo` 与 `mpvPlaybackSource()` 构造。
- 测试条目 `21648` 可选中 `mediaSourceId = mediasource_21648`，后端返回 mpv 直连静态流摘要，`diagnostics.streamKind = mpv-direct-static`，`diagnostics.sourceKind = direct-stream`。
- 线路2 `https://yuanshen.help/` 在真实后端请求中被 Cloudflare 拦截：
  - `PlaybackInfo` POST 返回 HTTP 403 / Cloudflare HTML。
  - `Users/{userId}/Views` GET 返回 HTTP 403 / Cloudflare。
  - `Videos/21648/stream` Range GET 返回 HTTP 403 / Cloudflare。
  - 默认 UA 与浏览器 UA 对照均返回 HTTP 403。

## 结论

- 播放源切换代码对线路1的真实播放源构造已闭环。
- 当前线路2不是单纯的 `PlaybackInfo` 请求方式或 User-Agent 问题；API 与直连流都被上游 Cloudflare 策略阻断，Electron 后端无法在不绕过上游策略的前提下保证该线路播放。
- 下一步优先做 Electron release 环境的线路1真实播放冒烟；线路2需要服务器 / 反代侧放行 API 与媒体流后才能继续验证真实切线播放。
