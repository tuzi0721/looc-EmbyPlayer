# Web Preview 内嵌播放

- **时间**：2026-06-01 04:38 (UTC+8)
- **动机**：Web Preview 已能真实登录和浏览媒体库，但播放器仍缺少真实播放源、HLS/CORS 流媒体代理与 HTML 内嵌播放路径，导致浏览器预览环境无法验证远端播放。
- **修改文件**：
  - `src/platform/index.ts`：补齐 Web Preview `get_playback_source` / `play` / `get_state` / `pause` / `resume` / `seek` / `stop` / 播放进度上报 fallback，使用真实 `PlaybackInfo` 生成 HLS 播放源、线路候选和媒体源候选。
  - `src/views/PlayerView.vue`：Web Preview 启用 HTML/HLS 内嵌视频；播放源切换支持浏览器视频路径；浏览器自动播放限制不再显示为播放错误，而是加载后等待用户点击播放。
  - `vite.config.ts`：新增 `__hills_web_stream_proxy`，代理 HLS playlist/segment，并重写 playlist URI 以绕过浏览器 CORS 限制。
- **风险**：Web Preview HLS 代理仅用于本地预览服务；真实桌面播放仍以 Electron/Tauri 随包 mpv 为主。浏览器若阻止自动播放，需要用户在播放器内再点一次播放。
- **回滚**：撤回上述 3 个文件即可回到 Web Preview 不支持真实远端播放的状态。
- **验证步骤**：
  - `npm.cmd run build`
  - `npm.cmd run electron:build`
  - `git diff --check`
  - in-app Browser 打开本地 1422 预览，用测试账号新增两条 443 线路并真实登录。
  - in-app Browser 首页确认拉到 5 个媒体库，进入真实剧集后打开播放器并播放到 01:30+，画面出现实际视频帧。
  - 敏感值扫描确认未写入测试账号、密码或完整线路地址。
- **结果**：通过；Web Preview 真实登录、媒体库、播放源获取、HLS 代理和内嵌播放链路已闭环，Electron 打包产物继续通过随包 mpv 完整性检查。
