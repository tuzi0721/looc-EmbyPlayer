# 2026-06-02 19:45 Real native resize black-frame audit

## 背景
- 上一阶段只通过了本地首页/详情视觉 smoke，尚未用真实账号、真实 Emby 服务端和真实播放链路确认播放器内嵌。
- 用户明确要求不再用彩条、本地假视频或页面海报兜底作为播放证据，真实播放截图必须来自应用内 native child/mpv 窗口，并且起播后等待 5 秒再取证。

## 真实复测结果
- 真实账号登录、Emby 识别、媒体库加载、继续观看候选、巨幕候选和真实 PlaybackInfo 均成功。
- 本次选中的真实剧集播放源为 `DirectPlay`，选中媒体源 `supportsTranscoding: false`，视频/音频/字幕轨道可见，仍满足本机解码约束。
- 播放器打开后使用 `mode=wid`、`hostKind=native-child`、app-owned child `hwnd`，不再是旧 overlay 漂浮窗口。
- 起播就绪后额外等待 5 秒，后退 seek、全屏进入/退出、mpv 状态比例和退出清理均通过；退出后剩余播放相关进程为 0。
- 失败点集中在播放器 resize 后的 native child 截图：1366x768、960x600、760x430 三个尺寸的 native capture 均被判定为黑屏/空白。

## 关键证据
- 保留目录：`C:\Users\Sakur\AppData\Local\Temp\hills-lite-real-visual-1780400510993`
- 失败截图包括：
  - `screenshots\player-1366x768-native.png`
  - `screenshots\player-960x600-native.png`
  - `screenshots\player-760x430-native.png`
- resize 后 `embedState.lastRect` 仍随播放器区域变化，mpv `video-out-params` / `osd-dimensions` 仍显示约 16:9；因此当前判断不是比例计算失败，而是 native child resize/repaint/capture 路径在窗口缩放后丢帧或黑帧。

## 结论
- 本阶段不能宣称真实播放器视检通过。
- 下一步必须继续修 Electron native child 宿主的 resize/repaint 路径，不能回退到 overlay，也不能用页面截图或海报图替代真实 mpv/native 截图。
