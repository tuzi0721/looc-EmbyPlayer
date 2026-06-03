# 2026-06-03 07:28 Tauri real smoke still state timeout

## 背景
- 使用 07:17 最新 Tauri/native release exe 重跑真实账号 visual smoke。
- 本轮包含前端 rebuild、Tauri release rebuild、embedded event-drain 和播放源返回结构修复。

## 结果
- 真实服务器登录、首页、详情页、剧集详情页、个人路由仍可推进。
- 点击真实详情页播放后进入 `/player/25372?...`。
- 播放器阶段仍失败：
  - `player-visual-ready`: `ready:false`, `state:null`
  - `player-metrics-captured`: `hasHtmlVideo:false`, `hasMpvState:false`, `mpvStateTimedOut:true`
  - 延迟截图仍不是可确认真实视频帧。
  - fullscreen 阶段仍触发 `Runtime.evaluate timeout`。

## 结论
- 07:18 的 event-drain 修复不足以解决真实 Tauri 播放状态卡死。
- 下一步需要定位 Tauri `play` 命令是否未返回、`get_state` 是否被 pending command 阻塞，或前端 embedded 启动链是否没有完成。
