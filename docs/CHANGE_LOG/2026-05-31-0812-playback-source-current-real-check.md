# 2026-05-31 08:12 - 当前工作树真实线路切源复核

## 摘要
- 在当前工作树上重新复核 Electron 播放源切换链路，确认线路1可登录、可按显式 `lineId/mediaSourceId` 构造同一媒体源重新开流。
- 线路2仍被 Cloudflare 返回 HTTP 403，失败边界仍在上游 / 反代访问策略，不是本地 `lineId` 透传缺口。
- 线路1媒体流 Range GET 可返回 HTTP 200 与视频字节，但本轮无日志 mpv 长等待没有拿到可证明的轨道 / 时长快照，因此本轮不把 mpv 真实加载复核记为通过。

## 验证结果
- 登录胜出线路：线路1。
- 测试条目：`21648`。
- 线路1默认构造：`mediaSourceId = mediasource_21648`，`streamKind = mpv-direct-static`，`sourceKind = direct-stream`，候选线路数 2，候选媒体源数 1。
- 线路1显式同源重新构造：传入 `lineId = line-1` 与 `mediaSourceId = mediasource_21648` 后仍返回 `mpv-direct-static` / `direct-stream`。
- 线路2显式切源构造：`PlaybackInfo` 返回 HTTP 403，响应特征为 Cloudflare HTML。
- 线路1流体 Range GET：HTTP 200，`content-type = video/x-matroska`，首个 chunk 读到 3061 bytes。
- Electron release 随包 mpv 无日志加载：35 秒等待后快照仍为 `durationMs = 0`、`trackCount = 0`，本轮未形成 mpv 真实播放通过证据。

## 备注
- 本阶段没有把测试账号密码、token 或完整播放 URL 写入仓库文档。
- 因用户指出播放窗口应内嵌，下一小阶段优先处理 mpv 内嵌播放体验，而不是继续纠缠独立 mpv 窗口冒烟。
