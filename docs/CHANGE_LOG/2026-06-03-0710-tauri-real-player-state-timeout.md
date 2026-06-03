# 2026-06-03 07:10 Tauri real player state timeout

## 背景
- 使用真实测试账号、真实线路和 Tauri/native release exe 重跑 visual smoke。
- 本轮保留真实截图与脚本输出，未使用本地彩条或模拟媒体。

## 结果
- 真实服务器登录、首页、详情页、剧集详情页、收藏/历史/聚合路由均已推进到检查阶段。
- 点击真实详情页播放后进入 `/player/25372?...`，但播放器没有返回可用 mpv 状态。
- `player-visual-ready` 返回 `ready:false`、`state:null`，`player-metrics-captured` 返回 `hasMpvState:false`、`mpvStateTimedOut:true`。
- 延迟截图 `player-initial.png` 仍是封面/背景层与 `0:00` 控件，不是真实视频帧。
- fullscreen 阶段随后触发 `Runtime.evaluate timeout`，说明 pending 状态调用仍会拖死后续交互。

## 结论
- 当前 Tauri/native 播放器不能算通过真实视检。
- 下一步继续修复 Tauri embedded mpv 的状态/播放链路，并同步修正播放器内嵌矩形与播放源返回结构。
