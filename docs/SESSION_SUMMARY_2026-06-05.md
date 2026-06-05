# 会话总结 — 2026-06-04 ~ 06-05

> 本次会话从「播放黑屏修不好、UI 观感差」出发，定位并修复了播放核心问题，并完成了播放器 UX 与整体 UI/主题改造（四期）。
> 所有改动均已构建验证并推送到 `main`。

## 一、最终成果一览

- **黑屏/无法播放：已彻底定位并修复**（账户 1 标准 Emby-behind-proxy 场景，直连串流端到端通过）。
- **播放器 UX**：全屏控件自动隐藏+光标隐藏、画面更铺满、鼠标可拖进度条、seek/搜索修复。
- **整体 UI 改造（四期）**：深色影院风 tokens、Home Spotlight、详情页影院化、backdrop 主色氛围、自定义窗口标题栏。
- **遗留**：账户 2（SmartStrm 自定义 `/smartstrm` 302 直链）需其服务器侧配置；非阻塞。

## 二、播放核心：根因与修复

### 1. 嵌入 mpv 生命周期竞态（黑屏 / `pipe is being closed`）— commit `e3b0815`
- 架构：release 实际用 IPC 后端（`mpv.exe` + `WS_CHILD` 子窗口 + `--wid`），`embedded.rs`(libmpv) 未启用。
- 根因：`bind_embedded` 每次 `embed_attach` 都无条件杀 mpv+重建 host；attach/play(spawn)/detach 无串行锁，full-flow 导航交错时中途杀掉刚 spawn 的 mpv。
- 修复：`ipc.rs` 加 `tokio` 生命周期互斥锁（attach/spawn 慢路径/detach 串行，snapshot 热路径无锁）+ `bind_embedded` 幂等（同父窗口复用、不杀 mpv）+ 先停 mpv 再销 host。
- 验证：真实 full smoke 两账户均无 `pipe closed`/host 超时、IPC 全程稳定、清理干净。

### 2. Range-broken / 黑屏真因 = 流地址走错路径 — commits `fa29cef`、`e4c0014`
- 误区排查：先怀疑探针 `bytes=0-0`（改 `bytes=0-` 无效，推翻）。
- 真因（由维护者 nginx 配置确认）：服务器 nginx 只在 `location ^~ /emby/` 透传 Range 并关缓冲；app 请求**裸路径** `/Videos/{id}/stream` 命中通用缓存 location → 返回 `200` 无 `Content-Range`。
- 修复（探针驱动、跨服务器稳健）：
  - `fa29cef`：`select_playback_line` 先探配置路径，再探 `/emby` 变体，选返回 `206` 的；`probe_range_support` 返回 `(status, supported)` 并用 `bytes=0-`；跳过 `4xx`。
  - `e4c0014`：优先用服务器权威 `MediaSource.DirectStreamUrl`（Emby Playback Guidelines）作首选候选（+`AddApiKeyToDirectStreamUrl` 字段与解析），其后才是合成路径与各自 `/emby` 变体。
- 验证：账户 1 原始根路径配置下，自动选中 `/emby/videos/.../original.mp4` 得 `206`，full smoke 端到端直连播放（H.264/AAC、1080p、硬解、有画面），旧的「无轨道/未就绪/黑屏」全部消失。

### 3. Range-broken 源缓存兜底 — commit `759905a`
- 新增 `mp4_prefetch.rs`：对「无 Range + 非 faststart」MP4 顺序下载到临时缓存（播完删）再本地播放（本地文件可 seek），前端「正在缓存 X%」进度条。
- 现降为深层兜底（`/emby` 探针修好后大多数源直连即可）；真实验证缓存→本地播放可达真实状态（`durationMs=1420053` 等）。

### 4. seek-back 与搜索 — commit `6015010`
- `nudgeSeek` 改用后端相对 seek（按 mpv 真实位置，不依赖可能过期的 store 位置），修复「seek back 跳到错误位置」。
- 真实 smoke 搜索断言对剧集改用剧集名（Emby 不按集名返回剧集）。

## 三、播放器 UX

- `e21776a`：全屏时控件自动隐藏 + 光标隐藏，鼠标移动再显示（`bumpControls` 原对嵌入模式提前 return，导致「伪全屏」）。
- `2a300d9`：底部预留上移 6px（原生窗口不再压住进度条，修鼠标拖动）+ 控件显隐时立即同步 rect（消除拖动时序竞争）+ 嵌入顶部 header 收窄为 40px 窄条（画面更铺满）。

## 四、整体 UI/主题改造（四期，方案见 `docs/UI_REDESIGN_PROPOSAL.md`）

- **一期** `73b54e7`：深色影院风 tokens（间距/圆角/阴影阶 + `--ambient`）、卡片圆角/hover 统一、侧栏选中态左侧指示条。
- **二期a** `c073513`：Home Spotlight banner（元数据胶囊 + 播放/继续行动区，直达播放并带 resume/source 上下文）。
- **二期b** `4bb66cc`：详情页 backdrop 底部融入页面背景（深浅自适应）+ 内联元数据胶囊。
- **三期** `a8463be`：`utils/dominantColor.ts` 提取 backdrop 主色 → 详情页氛围辉光（`color-mix`，CORS 失败优雅回退）+ hero 入场动效。
- **四期** `74b36ed`：`decorations:false` + 自定义深色标题栏（拖拽 + 最小/最大/还原/关闭 + 8 向缩放手柄），播放器路由隐藏。

## 五、提交清单（本会话，均在 `main`）

| commit | 说明 |
| --- | --- |
| `e3b0815` | 嵌入 mpv 生命周期串行化（修竞态黑屏/pipe closed） |
| `759905a` | Range-broken MP4 缓存到本地再播（深层兜底） |
| `fa29cef` | `/emby` 探针回退恢复 HTTP Range（真因修复） |
| `e4c0014` | 优先用服务器 DirectStreamUrl 探针（跨服务器稳健） |
| `6015010` | nudge 用相对 seek；剧集搜索用剧集名 |
| `e21776a` | 全屏控件+光标自动隐藏 |
| `2a300d9` | 画面更铺满 + 修进度条拖动 |
| `73b54e7` | UI 一期：tokens/卡片/侧栏 |
| `c073513` | UI 二期a：Home Spotlight |
| `4bb66cc` | UI 二期b：详情页影院化 |
| `a8463be` | UI 三期：氛围主色 + 动效 |
| `74b36ed` | UI 四期：自定义窗口标题栏 |

## 六、关键调研结论

- 主流影音 UI（Plex Modern、Apple TV、Jellyfin 主题 ijelly/Abyss/NetFin/Finity）= 深色影院风 + 巨幕 backdrop + 从艺术图提取主色做沉浸背景 + 玻璃拟态 + 元数据胶囊 + 弹性动效；纯白主题做海报墙观感差。
- Emby 反代规范：媒体流走 `/emby/` 子路径 + `proxy_set_header Range` + `proxy_buffering off`；`MediaSource.DirectStreamUrl` 是服务器权威投递 URL。

## 七、遗留 / 后续

- **账户 2（cnmbyd.xyz）**：用 SmartStrm（`/smartstrm` 302 直链）+ Cloudflare Worker（屏蔽浏览器、转发裸 Emby），`/smartstrm` 对客户端 404；属其服务器代理链路配置（Worker 应指向 SmartStrm 302 代理层），非客户端 bug。客户端已正确跟随 302。
- 可选 UI 打磨：Home Spotlight 也应用氛围主色、更广的列表错落动效、各屏视觉微调。
- 当前 release exe：`src-tauri/target/release/emby-player.exe`（含全部上述改动）。
- 验证方式备忘：`HILLS_REAL_APP_MODE=tauri-release` + `HILLS_REAL_APP_EXE` + `HILLS_REAL_INPUT_FILE`(5 行: line1,line2,user,pass,itemId)，`HILLS_REAL_COMMAND_ONLY=1` 跑命令级、`HILLS_REAL_VISUAL_KEEP_ARTIFACTS=1` 保留 `visual-smoke.log`。
