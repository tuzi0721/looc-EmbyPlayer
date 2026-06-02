# 2026-06-02 17:30 Real player aspect visual pass

## 背景
- 上一阶段收紧了播放器比例证据链，本阶段立刻用真实测试账号和真实 Emby 线路重跑多尺寸 visual smoke。
- 验证目标不是页面截图“看起来有画面”，而是确认真实 mpv/native 视频层、真实输出比例、真实控件和退出清理。

## 验证
- `npm.cmd run build`
- `node scripts\smoke-electron-embedded-local.mjs`
- 真实账号 `node scripts\real-server-visual-smoke.mjs`

## 真实环境结果
- 真实服务器检测为 Emby，登录成功，加载 5 个媒体库视图。
- 播放源选择为 `DirectPlay`，候选媒体源 2 个，选中源 `supportsTranscoding: false`，保持本机解码/直连播放约束。
- 剧集详情页播放探针成功打开真实可播集 `/player/34758?...`，没有打开 Series 本体。
- 详情页播放打开 `/player/25372?...`，`player-visual-ready` 后额外等待 5 秒抓取 native/mpv 层。
- 初始播放和 1366x768 / 960x600 / 760x430 resize 均抓到当前 Electron 进程树内 `mpv.exe` native 窗口，非黑屏。
- mpv 自报源比例和输出比例均为约 `1.777778`；`osd-dimensions` 内容框在各尺寸下约等于 16:9；`keepaspect=true`、`panscan=0`、`videoZoom=0`、`videoScaleX=1`、`videoScaleY=1`。
- 后退按钮从 15000ms 回到约 5000ms；全屏进入/退出通过；退出后剩余播放进程为 0。
- 真实 smoke 输出 `ok: true`，失败项为空。

## 人工视检
- 已人工查看真实输出目录中的 native/mpv 播放截图：`player-native-playback.png`、`player-1366x768-native.png`、`player-960x600-native.png`、`player-760x430-native.png`。
- 已人工查看 UI 小窗口和首页/详情样本：`player-760x430-ui.png`、`home-760x430.png`、`home-1366x768.png`、`detail-760x430.png`、`series-detail-760x430.png`。
- 确认播放器画面本体没有再出现竖版海报冒充视频；小窗口下存在左右黑边是 `fit` 模式保持 16:9 的正常结果。

## 产物
- 真实视检保留目录：`C:\Users\Sakur\AppData\Local\Temp\hills-lite-real-visual-1780392497912`

## 下一步
- 刷新 Electron unpacked exe，并把本阶段修复、日志和验证结果提交推送。
