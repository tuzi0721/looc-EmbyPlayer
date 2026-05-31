# Hills Lite — 当前项目状态快照

> **更新时间**：2026-05-31（Electron 内嵌播放 owned popup 宿主）
>
> **规格**：[`UI_REFERENCE_HILLS_LITE.md`](./UI_REFERENCE_HILLS_LITE.md)
>
> **变更日志**：[`CHANGE_LOG/2026-05-31-1315-electron-embedded-popup-host.md`](./CHANGE_LOG/2026-05-31-1315-electron-embedded-popup-host.md)

---

## 1. 概览

| 项 | 值 |
|---|---|
| 路径 | `A:\vsc\emby-player` |
| 显示名 | **Hills Lite** |
| 可执行文件 | `src-tauri\target\release\emby-player.exe` |
| Electron portable | `release-electron\Hills Lite 0.1.0.exe` |
| 内置 mpv | `release-electron\win-unpacked\resources\mpv\mpv.exe`；Tauri 构建为 `src-tauri\target\release\resources\mpv\mpv.exe` |
| 强调色 | `#a855f7` |

---

## 2. UI 状态（Phase 1）

| 页面 | 状态 |
|---|---|
| Sidebar + TopBar | ✅ 已接入 |
| 首页 / 收藏 / 历史 / 聚合视界 / 下载 / 通知 / 遥控 / 媒体库 | ✅ |
| 详情页 Hero + 横滑选集 + 演职人员 | ✅ |
| 播放页底栏 + 返回详情 + 海报背景 | ✅（`back()` 为 fire-and-forget stop） |
| 设置页单列分组 | ✅ |

**注意**：当前 `tauri.conf.json` 已设置 `bundle.active: false` 与 `targets: []`，发布验证以 `src-tauri\target\release\emby-player.exe` 为准。

**架构方向**：已决定迁移到 Electron + Vue 3 + TypeScript；播放核心坚持 mpv/libmpv-first，HLS 仅作为后备路径。路线见 [`ROADMAP/electron-migration.md`](./ROADMAP/electron-migration.md) 与 [`ROADMAP/product-roadmap-v2.md`](./ROADMAP/product-roadmap-v2.md)。当前阶段保留 Tauri 可运行路径，同时通过 `src/platform` 抽象层解除前端对 Tauri API 的直接绑定。

**2026-05-29**：设置页新增“媒体库 → 首页轮播图风格”，可在标准与巨幕之间切换；巨幕模式使用更高的 Hero 高度、更大的标题布局和 2200px 背景图请求。

**2026-05-29**：侧边栏新增“历史”入口与 `/history` 页面，按最近播放时间展示已看电影/剧集，支持全部/电影/剧集筛选、刷新和分页加载。

**2026-05-29**：聚合视界从占位页改为可用入口，聚合当前账号的搜索、继续观看、收藏和最近看过内容，并提供概览/收藏/历史分段切换。

**2026-05-29**：服务器连接器图标与活动线路 fallback 抽到 `src/utils/serverVisuals.ts`；侧边栏服务器项使用统一连接器头像并显示线路健康点，首页未登录服务器卡片复用同一套图标/线路解析。

**2026-05-30**：媒体库分区页顶部标题改为常显当前分区名称；直达 `/library/:id` 且视图缓存为空时，会在加载媒体条目的同时并行补拉视图元数据，长标题保持单行省略。

**2026-05-30**：单集详情页会并行加载季列表与当前季剧集，并通过详情/剧集加载序号避免快速切换 PDP 时旧请求覆盖新页面状态。

**2026-05-30**：新增 Electron `hills-image://` 图片缓存协议；海报卡、首页 Hero、详情页和播放页图片复用 `src/utils/mediaImages.ts`，Electron 走 `.electron-user-data/image-cache` 磁盘缓存，Web/Tauri 仍回退远端 URL。

**2026-05-30**：播放器页内快捷键动作、组合键和设置页说明集中到 `src/utils/keyboardShortcuts.ts`；播放器改用动作分发表接入 `useKeyboard`，并修正单独 `+` 键的匹配。

**2026-05-30**：播放器内嵌 mpv / composition 的 stage rect 同步新增 `ResizeObserver` + `requestAnimationFrame` 节流，同尺寸 rect 不重复发送，卸载时并行隐藏并 detach 嵌入宿主。

**2026-05-30**：播放器底部控制栏新增 `data-control` 稳定标识与 `wide` / `medium` / `small` 宽度档位收纳规则，窄窗口优先保留播放、字幕/弹幕、设置、选集和全屏入口，并移除无音轨时的静态占位按钮。

**2026-05-30**：Electron 打包运行时依赖改为显式外部处理；渲染层依赖集中到 `devDependencies` 并由 Vite bundle，`beforeBuild` hook 跳过生产 `node_modules` 收集，`electron:build` 不再输出 duplicate dependency references / Node DEP0190 / 空依赖 traversal fallback。

**2026-05-30**：新增 `scripts/check-electron-command-coverage.mjs` 与 `npm.cmd run check:electron-commands`，自动比对 renderer `invoke("...")` 调用、Electron main handler 和显式 no-op 命令，当前 85 个 renderer 命令全部覆盖。

**2026-05-30**：`electron:preview`、`electron:build` 与 `electron:dist` 已接入 `check:electron-commands` 前置闸门；未迁移 renderer 命令会在 Electron 预览/打包进入实际启动或 builder 前失败。

**2026-05-30**：新增 `scripts/check-electron-package.mjs` 与 `check:electron-package`，`electron:build` / `electron:dist` 会在 builder 后检查 `app.asar` 与随包 `resources/mpv` 完整性；当前 Electron unpacked 产物含 6 个 mpv 文件，总量 213.7 MiB。

**2026-05-30**：侧边栏主导航补齐“下载”“通知”“遥控”入口；下载入口显示运行/暂停任务数，通知入口打开通知中心并显示未读数，遥控入口进入远程会话控制页。

**2026-05-30**：Tauri `build.rs` 改为只复制 `src-tauri/resources/mpv`，不再读取 `HILLS_LITE_MPV_DIR`、`vendor/mpv` 或从 GitHub 下载/解压 mpv；随包 mpv 缺失或复制失败时构建会直接失败，`Cargo.toml` / `Cargo.lock` 同步移除 build-time 下载与 7z 解压依赖。

**2026-05-30**：新增 `scripts/check-tauri-package.mjs` 与 `check:tauri-package`，`tauri:build` 会在 release 构建后确认 `emby-player.exe` 与 `target\release\resources\mpv` 完整性；本轮完整 `npm.cmd run tauri:build` 已通过。

**2026-05-30**：`npm.cmd run electron:dist` 已实际跑通，生成 `release-electron\Hills Lite 0.1.0.exe`（当前 148,937,281 bytes）；构建链已确认经过 Electron 命令覆盖检查、Vite build、portable builder 与随包 mpv 完整性后置检查。

**2026-05-30**：Electron builder Windows 配置接入 `src-tauri/icons/icon.ico`；重新生成 portable 后不再出现 `default Electron icon is used`，Windows exe 使用项目图标。

**2026-05-30**：新增 `scripts/check-electron-dist.mjs` 与 `check:electron-dist`，`electron:dist` 会在 unpacked/mpv 完整性检查后继续确认最终 portable exe 存在且体积合理。

**2026-05-30**：`scripts/run-release.ps1` 默认改为 Electron unpacked release，并新增 `-Target electron|portable|tauri` 与 `-NoLaunch`；脚本内部统一使用 `npm.cmd run` 触发已接入完整性闸门的构建脚本。

**2026-05-30**：播放器 Stats 浮层升级为综合、视频、音频、轨道、Whisper 五页；设置页播放器面板新增“统计浮层”模式，默认 WinUI，也可切到 mpv OSD，播放器统计入口会调用 mpv `stats/display-page-N` / `stats/display-stats`。

**2026-05-30**：Electron mpv resolver 移除旧 `src-tauri\vendor\mpv` 与 exe 旁 `mpv` 候选路径，缺失时报 `bundled mpv executable not found`；`scripts/test-playback-flow.ps1` 改为 `npm.cmd run ...` 并把 Tauri release 随包 mpv 缺失视为硬失败，不再提示系统 PATH mpv。

---

## 3. 播放与返回

- 详情 → 播放：`/player/:id?from=<detailId>`
- 播放返回：`/item/${from || SeriesId || id}`

---

## 4. MPV

- IPC 模式：命名管道 `\\.\pipe\hills-lite-mpv-{uuid}`
- error 123 已修复（`ServerOptions::create(&pipe_path)`）
- **2026-05-31**：播放窗口内嵌宿主已接线：Electron `embed_*` 不再是 no-op，会创建应用托管宿主窗口并把原生句柄以 `--wid` 传给随包 mpv；Tauri IPC 后端也会在已有宿主窗口时传 `--wid` 并关闭独立窗口强制创建。前端默认在 Electron/Tauri 启用内嵌，Web Preview 关闭；Electron 真实内嵌播放 smoke 已在临时 userData 中完成并返回有效 mpv 时长/轨道/播放状态。
- **2026-05-31**：Electron 内嵌播放宿主从主窗口内部 Win32 child HWND 改为 owned popup 宿主窗口，绕过 Chromium 合成层遮挡；本地 embedded smoke 的屏幕截图和 mpv 自截图均返回彩色视频像素，`electron:build` 已确认 `resources\electron_mpv_host.exe` 与随包 mpv 一起进入 unpacked 产物。
- **2026-05-31**：Electron release 随包 `release-electron\win-unpacked\resources\mpv\mpv.exe` 已通过真实线路1播放冒烟；测试条目 `21648` 的 `mpv-direct-static` / `direct-stream` 播放源被 mpv accepted，IPC 快照读到 `durationMs = 866026`、`trackCount = 4`、H.264 视频、AAC 音频、`positionMs = 1250` 且 `paused = false` / `eof = false`。
- **2026-05-31**：Electron release 随包 mpv 的真实控制项冒烟已覆盖字幕轨切换、Stats OSD 和截图；测试条目 `21648` 快照返回视频轨 1 条、音频轨 1 条、字幕轨 2 条，`sid = 1` 切换与 `sid = no` 关闭均成功，`stats/display-page-1` 成功，`screenshot-to-file` 生成 `6990409` bytes 临时 PNG 并已删除。
- **2026-05-31**：Electron release 随包 mpv 的真实章节跳转冒烟已通过；章节样本条目 `16240` 的 `chapter-list` 返回 Opening / Story / Ending 三章，跳转到第二章 `90007ms` 后 IPC 快照返回 `positionMs = 90007`、`activeChapter = 1`。
- **2026-05-30**：Tauri 构建脚本只复制仓库内置 `src-tauri\resources\mpv` 到 `target\<profile>\resources\mpv`；构建期不再读取本机 mpv 目录、不再下载 mpv、不再解压 7z，随包缺失或复制失败会直接中断构建。Electron 打包继续通过 `extraResources` 复制同一随包目录。
- **2026-05-30**：Electron mpv resolver 只保留 Electron resources、仓库 `src-tauri\resources\mpv` 与 Tauri target resources 等应用管理路径，不再扫描旧 `vendor/mpv` 或 exe 旁临时 mpv；`scripts/test-playback-flow.ps1` 同步改为随包 mpv 硬检查。
- **2026-05-30**：`check:tauri-package` 会在 Tauri release 后确认 `src-tauri\target\release\emby-player.exe` 与 `resources\mpv` 存在，并比对源随包 mpv 目录与 release 目录的文件数量/大小。
- **2026-05-30**：`check:electron-package` 会在 Electron 打包后确认 `release-electron\win-unpacked\resources\mpv` 与源 `src-tauri\resources\mpv` 文件数量/大小一致，并对 `mpv.exe`、`libmpv-2.dll`、`d3dcompiler_43.dll`、`mpv/fonts.conf` 做最低体积保护。
- **2026-05-29**：mpv 固定为应用随包播放核心；移除用户可见的本机 mpv 检测横幅、下载/选择路径入口和 `MPV 路径` 设置项，Electron/Tauri 启动 mpv 时只解析随包资源路径，不再读取用户配置或 PATH。
- **2026-05-25**：离开播放页时 `embedDetach` 完整 teardown（shutdown mpv + DestroyWindow）
- **2026-05-25**：`ensure_started` 检测 mpv 进程存活，死亡自动重启
- **2026-05-27**：清理 Rust `cargo check --all-targets` unused warning；前端播放器 store 改为静态导入，避免 Rollup 动态/静态混用 chunk 提示
- **2026-05-27**：设置保存串行化，避免重复输入类设置堆积并发写入。

---

## 5. 响应兼容性与诊断

- **2026-05-31**：Web Preview 本地代理补齐真实网络代理 fallback：`/__hills_web_proxy` 直连失败后会尝试环境变量代理与常见本机代理端口，解决浏览器预览通过 CORS 代理访问真实 443 线路时 Node `fetch` 不走系统代理导致的 `fetch failed`；当前两条真实线路公开探测均返回 200，测试账号真实登录成功并能拉到 5 个媒体库视图。
- **2026-05-31**：Web Preview 真实登录与媒体库链路补齐：浏览器预览会通过本地 Vite 代理请求 Emby/Jellyfin API，`detect_server`、`login`、`list_views`、`resume_items`、媒体列表/详情/搜索等不再返回假数据；线路测活改为真实 `/System/Info/Public` 耗时并写回线路状态；服务器与账号态写入本地 `localStorage`，设置页新增服务器后立即刷新列表和账号态，避免新增条目看起来覆盖旧服务器。
- **2026-05-31**：添加服务器弹窗改为“服务器 + 账号”一条流；类型默认自动识别，也可手动选择 Emby / Jellyfin。线路输入新增独立端口框，地址与端口会合成实际请求 baseUrl；填写用户名和密码时会保存后立即登录，不再要求用户先保存再跳到另一个页面找登录入口。
- **2026-05-31**：添加服务器弹窗的“账号”区前移到基础信息之后、线路信息之前，1280x720 预览下用户名、密码与端口输入能在首屏同时可见；弹窗内容区补齐 flex 滚动约束，避免底部按钮栏压住输入框。
- **2026-05-31**：新增 `detect_server` 平台命令，Electron / Tauri 均通过 `/System/Info/Public` 探测可用线路并识别 Emby / Jellyfin，命中线路会作为新服务器 `activeLineId` 保存；Web Preview 提供内存 fallback，便于浏览器预览验证。
- **2026-05-31**：Web Preview 补齐 `login` / `list_accounts` / `switch_account` / `logout` 内存账号态；浏览器预览中保存并登录后，侧边栏可以直接显示已连接服务器，避免把预览环境误判为真实后端登录失败。
- **2026-05-31**：Web Preview 平台层新增内存服务器 fallback，支持 `list_servers`、`add_server`、`update_server`、`remove_server`、`set_active_line` 和 `test_lines`；浏览器预览现在可以真实保存服务器、编辑线路 UA/headers 并看到测活状态，刷新页面后重置，Electron/Tauri 仍走真实持久化。
- **2026-05-31**：添加服务器弹窗与设置页服务器编辑面板接入默认 User-Agent、单线路 User-Agent、线路启用状态和自定义 headers；headers 使用多行 `Name: Value` 文本解析，更新已保存服务器时会带回 line id，避免 Electron 更新线路配置后丢失 active line，Tauri `update_server` 也兼容清空默认 UA 并优先按 line id 保留已有线路。
- **2026-05-29**：启动完成后新增后台线路可达性探测，`server.probeAllLines()` 会并发调用已保存服务器的 `test_lines`，合并健康报告后刷新服务器列表；首屏不等待网络探测，手动“测试线路”行为保持不变。
- **2026-05-28**：DanDanPlay 响应字段增加 `serde(default)`，HTTP/JSON 错误包含 URL、状态码与 1200 字符以内的 body preview（换行转义）。
- **2026-05-29**：DanDanPlay 匹配与评论请求统一注入 `Hills Lite/0.1.0 (danmaku)` User-Agent，并声明 JSON Accept，避免弹幕源看到默认 reqwest UA。
- **2026-05-29**：播放器弹幕开关新增常显 `弹幕` 文本，开启时沿用强调色 active 状态；窄窗口下自动收回为图标按钮，避免控制栏拥挤。
- **2026-05-29**：播放器弹幕按钮旁新增弹幕菜单，状态/来源/数量分行显示且数量独立为第三行；加载后会合并 1.2 秒内同模式同文本的重复弹幕，并在渲染层以 `×N` 展示。
- **2026-05-29**：设置页弹幕面板新增“避让字幕”和“底部避让区域”，默认开启并保留底部 18%；播放器 `DanmakuOverlay` 会按设置收缩底部弹幕区域，减少弹幕压住字幕的情况。
- **2026-05-29**：播放器进度条新增弹幕热度条，已加载弹幕后会按 60 个时间段统计弹幕密度，并用琥珀色热度柱提示高互动片段。
- **2026-05-28**：Emby 响应模型对常见缺字段/null 字段增加 `serde(default)` / `null_to_default`，覆盖列表、用户数据、播放源、媒体流、远程会话和播放状态。
- **2026-05-28**：Emby/Jellyfin JSON API 请求显式使用 `Accept-Encoding: identity`，规避部分服务端/反代压缩响应导致的 `error decoding response body`。
- **2026-05-28**：Emby/Jellyfin 常见字符串、数值、布尔字段改为宽容解码，支持字符串、数字、布尔和带 `Name` / `Title` / `Value` / `DisplayName` / `Id` 的对象；`Genres` / `BackdropImageTags` 字符串数组兼容非标准返回，避免剧集详情页 `expected a string` / 数值类型不一致直接崩溃。

---

## 6. 播放页可用性

- **2026-05-31**：Electron release 随包 mpv 已完成线路1真实播放冒烟：后端构造 `mpv-direct-static` 播放源后，mpv 实际加载媒体并通过 IPC 返回时长、轨道、H.264 / AAC codec、硬解状态和前进中的播放位置，确认播放源切换基础链路不止停留在 URL 构造层。
- **2026-05-31**：真实播放会话中继续验证了播放器控制面：同一线路1媒体内可通过 mpv IPC 切到字幕轨 `sid = 1` 并关闭字幕，mpv Stats OSD 页面命令可执行，截图命令可生成 PNG 后清理；该媒体没有章节，因此章节跳转仍待有章节样本继续验证。
- **2026-05-31**：章节样本条目 `16240` 已完成真实跳转验证；mpv `chapter-list` 返回 3 章，播放器章节菜单依赖的章节时间和当前章节索引可从 IPC 快照取得，跳到 Story 章节后位置与目标一致。

- **2026-05-31**：真实测试账号联调确认线路1 `https://ciallo.party/` 可完成 Electron `PlaybackInfo` 与 `mpvPlaybackSource()` 构造，测试条目 `21648` 选中 `mediasource_21648` 并返回 `mpv-direct-static` / `direct-stream` 摘要；验证过程未把 token、密码或完整播放 URL 写入仓库文档。线路2 `https://yuanshen.help/` 的 `PlaybackInfo`、普通认证 API 与直连流 Range GET 均被 Cloudflare 返回 HTTP 403，默认 UA 与浏览器 UA 对照一致，因此该线路需要上游 / 反代放行 API 与媒体流后才能继续做真实切线播放验证。

- **2026-05-31**：播放器底栏在存在多个播放线路或 `PlaybackInfo.MediaSources` 候选时显示“播放源”入口；面板按“播放线路 / 媒体源”分组展示候选摘要，切换时按当前播放位置重新发起 mpv 播放并传入 `lineId` / `mediaSourceId`，同时 best-effort 上报旧会话停止进度。设置菜单也提供“播放源”入口，便于窄窗口访问。

- **2026-05-31**：Electron `get_playback_source` 会返回当前播放线路、线路候选和 `PlaybackInfo.MediaSources` 候选摘要；`play` / mpv 播放链支持传入 `lineId` 与 `mediaSourceId` 指定候选重新开流，播放日志与串行去重 key 同步区分切源请求；Tauri `play` / `play_external` 已同步兼容 `lineId` 与 `mediaSourceId`，并让服务器字幕列表跟随当前播放会话线路；Electron 外部播放器入口也会透传线路 / 媒体源选择。

- **2026-05-30**：播放器底部控制栏按 1180px / 920px / 620px 三档收纳低频控件；倍速/截图、队列前后/音轨/章节、快退/快进/音量会随宽度逐级隐藏，核心播放、字幕/弹幕、设置、选集与全屏入口保持可用。
- **2026-05-30**：播放器 Stats 浮层新增五页标签：综合页显示时间/进度/缓存/轨道概况，视频页显示 codec、硬解、尺寸、FPS、码率和丢帧，音频页显示 codec、采样率、声道、码率和速度，轨道页列出全部 mpv 轨道状态，Whisper 页显示当前实时字幕任务状态；播放行为设置可切换为 mpv 自带 OSD。
- **2026-05-30**：播放器内嵌 mpv/composition 尺寸同步新增 stage `ResizeObserver`、rAF 节流和重复 rect 去重；全屏变化与窗口 resize 共用同一条同步路径，卸载时断开 observer 并并行执行 `embedSetVisible(false)` / `embedDetach()`。
- **2026-05-30**：播放器页内快捷键改为 `PLAYER_SHORTCUTS` 动作分发表，设置页“播放页内”说明复用 `PLAYER_SHORTCUT_SUMMARY`；`useKeyboard` 复用共享组合键解析，并支持稳定匹配单独 `+` 键。
- **2026-05-29**：播放器卸载清理改为并行执行置顶恢复、副屏遮黑关闭和 `player.stop()`，通过 `Promise.allSettled` 统一等待；HTML5/HLS fallback 的本地销毁仍保持同步处理，减少关闭播放页时被单个桌面命令拖慢的概率。
- **2026-05-29**：播放器底栏移除没有点击行为的“版本”图标按钮；多版本/媒体源切换待后续接入真实 PlaybackInfo 媒体源数据后再提供入口。
- **2026-05-29**：播放器设置菜单移除没有 mpv shader/滤镜后端支撑的 `Anime4K PRO` 占位按钮，并删除对应 `.pro` 样式，避免不可用入口误导用户。
- **2026-05-29**：播放器错误浮层出现时可按 `r` 触发重试，复用同一套 `retryPlayback()` loading 与防连点逻辑；正常播放无错误时该键不触发重试。
- **2026-05-29**：播放器错误浮层的“重试”按钮新增 loading 与防连点状态，重试期间不会重复触发并发播放启动。
- **2026-05-29**：播放器错误浮层新增“重试”动作，复用首次进入播放器的播放启动逻辑，重试前会清空错误状态、关闭临时面板并按当前路由参数重新启动播放。
- **2026-05-29**：播放器错误浮层新增“复制错误”动作，复制内容包含播放错误标识、时间、当前 ItemId、标题和错误正文；复制结果会在错误浮层内短暂提示。
- **2026-05-29**：播放器字幕面板、弹幕菜单、设置菜单、章节菜单、选集菜单和统计浮层统一改为互斥切换，打开一个会关闭其他临时面板；设置菜单内的字幕/弹幕/统计入口也会直接切到目标面板。
- **2026-05-29**：截图提示条新增“复制路径”动作，优先使用浏览器 Clipboard API，失败时回退到隐藏文本框复制；复制成功或失败后都会保留本次截图路径，方便继续打开目录或重试。
- **2026-05-29**：截图保存提示改为显示短文件名，并在播放器提示条内提供“打开目录”动作；Electron 通过 `shell.openPath` 打开目录，Tauri 通过 `open_path` 命令调用系统打开能力。
- **2026-05-29**：设置页播放器面板和播放器设置菜单新增“截图包含字幕”开关，截图按钮会按该持久设置决定传给 mpv 的 screenshot 模式。
- **2026-05-29**：播放器底栏播放按钮两侧新增“后退 10 秒”和“前进 30 秒”按钮，复用现有 seek 逻辑，鼠标/触控操作不再只能依赖键盘左右键。
- **2026-05-29**：设置页播放器面板新增“自动跳过片头/片尾”开关和片头/片尾秒数；播放器设置菜单占位项改为真实开关，播放页会在每个条目内至多自动跳一次片头，并在片尾且队列有下一项时自动切到下一项。
- **2026-05-29**：字幕面板的“字幕大小”扩展为“字幕样式”，支持持久化比例、文字/描边颜色、描边宽度、阴影偏移、垂直位置和强制覆盖 ASS；Electron/Tauri 新播放会话会自动把这些设置套用到 mpv。
- **2026-05-29**：设置页播放器面板新增“切换轨道时保留缓存”开关，默认开启；Electron/Tauri 切换音轨或字幕轨默认只更新 mpv `aid` / `sid`，关闭该开关时会在切轨后显式执行 `drop-buffers`，远程会话切轨命令也复用同一设置。
- **2026-05-29**：设置页播放器面板新增“全屏遮黑其他副屏”开关，默认关闭；播放器监听全屏状态并调用 `set_secondary_display_blackout`，Electron 会为非播放显示器创建黑色全屏置顶窗口，退出全屏、关闭播放器、隐藏到托盘或退出应用时清理；Tauri 侧保留同名命令并使用 `blackout.html` 创建副屏遮黑窗口。
- **2026-05-29**：播放器底部工具栏新增章节按钮；Electron/Tauri snapshot 读取 mpv `chapter-list` 与当前 `chapter`，章节列表支持按时间跳转，Stats 浮层同步显示当前章节。
- **2026-05-29**：播放器底部工具栏新增截图按钮；Electron/Tauri 均接入 mpv `screenshot-to-file`，保存 PNG 到应用数据目录的 `screenshots` 子目录并在播放器内提示保存路径。
- **2026-05-29**：播放器顶部“置顶”按钮接入真实窗口置顶开关；Electron/Tauri 均新增 `set_always_on_top` 命令，离开播放器时会尝试恢复非置顶。
- **2026-05-29**：播放器设置菜单“统计信息”改为可用 Stats 浮层，展示时间、进度、速度、音量、缓存、网络、当前音轨/字幕和轨道数量，支持菜单开关与 `Esc` 关闭。
- **2026-05-29**：设置页播放器面板新增 `Windows HDR` 按钮，Windows 平台可直接打开系统显示/HDR 相关设置，非 Windows 平台禁用。
- **2026-05-29**：设置页新增“外部播放器”面板，持久化外部播放器路径和启动参数；播放器设置菜单新增“外部播放器”入口，Electron/Tauri 均可把当前媒体流、标题和当前位置交给系统默认或指定外部播放器打开。
- **2026-05-29**：设置页新增“弹幕”面板，持久化弹幕透明度、速度和字号；播放器 `DanmakuOverlay` 改为读取设置 store 中的弹幕参数。
- **2026-05-28**：设置页播放器分组新增“右上角网速”开关，默认关闭。
- **2026-05-29**：设置页播放器分组新增“附加授权查询参数”开关，默认关闭；Emby/Jellyfin 播放与下载 URL 默认不再写入 `api_key`，mpv、下载引擎和 HLS 后备改用认证请求头，必要时可手动开启兼容旧服务。
- **2026-05-28**：播放页从 MPV `cache-speed` 读取可选 `networkBps`，开启后在右上角显示 MB/s 与短活动条。
- **2026-05-28**：播放页选集按钮接入当前播放队列，支持查看集数、当前集高亮和点击切换播放；顶部标题跟随当前播放项更新。
- **2026-05-28**：播放页在外部 mpv 窗口模式下显示当前媒体的背景/海报，并将顶部/底部控制区域限制在宽屏最大内容宽度内，避免带鱼屏、2K/4K 下控件过度分散。
- **2026-05-29**：播放器迷你进度条新增缓存进度层与缓冲提示；Electron mpv snapshot 读取 `demuxer-cache-duration`、`paused-for-cache`、`cache-buffering-state`，HTML video fallback 使用原生 buffered ranges 映射同一 UI。
- **2026-05-29**：播放器剧集队列标题改为 `S01E02 · 标题 (年份)`，非剧集条目标题也直接带年份；副标题保留系列名，减少重复信息。
- **2026-05-29**：播放器设置菜单新增画面模式：适应窗口、填充裁切、拉伸铺满、自动去黑边；Electron/Tauri mpv 后端统一映射 `keepaspect`、`panscan`、`video-zoom` 等属性，新播放和选集切换后会重新套用当前会话模式。

---

## 7. 详情页操作

- **2026-05-30**：单集详情页识别 `SeasonId` / `SeriesId` 后并行拉取季列表和当前季剧集；加载完成后抑制一次重复季切换请求，用户手动切季仍按当前系列正常加载。
- **2026-05-29**：详情页剧集区移除没有动作的“查看全部”按钮，并删除未再使用的 `.link-btn` 样式；当前保留季选择器和剧集横向播放入口。
- **2026-05-29**：详情页 Hero 分享按钮接入真实复制动作；有 Emby/Jellyfin Web 链接时复制服务器详情页链接，否则复制标题与 ItemId，播放器和详情页共用 `src/utils/clipboard.ts` 剪贴板工具。
- **2026-05-29**：详情页 Hero 移除写死的版本、音频和字幕下拉，删除 `versionLabel` / `audioLabel` / `subLabel` 静态状态与对应样式；真实轨道选择仍以播放器内 mpv 轨道和字幕面板为准。
- **2026-05-29**：设置页媒体库分组新增“JAV 番号过滤”开关；媒体库/搜索/收藏/历史/聚合/工作室/详情页附加内容与相似内容列表会按统一番号规则隐藏疑似条目，过滤后的分页继续使用远端 raw offset 避免重复加载。
- **2026-05-29**：详情页新增“附加内容”横滑区；Electron 与 Tauri 均接入 Emby/Jellyfin `Users/{userId}/Items/{itemId}/SpecialFeatures`，兼容数组返回与 `ItemsResponse` 返回，附加视频卡片点击后直接进入播放。
- **2026-05-29**：详情页底部新增“相似内容”横滑区；Electron 与 Tauri 均接入 Emby/Jellyfin `Items/{itemId}/Similar`，前端通过 `api.similarItems` 异步加载推荐项并可点击进入详情。
- **2026-05-29**：详情页 Hero 新增外部链接 pills，支持跳转当前 Emby/Jellyfin Web 页面以及 IMDb、TMDB、TVDB、豆瓣；Electron 详情请求会显式拉取并规范化 `ProviderIds`。
- **2026-05-29**：详情页 Hero 新增独立媒体类型徽标与观看状态徽标，类型不再混入题材标签；剧集缩略图新增集数角标、进度百分比/已看角标和底部进度条，已看剧集以完整绿色进度显示。
- **2026-05-28**：详情页收藏/已看按钮接入 Emby/Jellyfin 用户数据 API，支持 loading、乐观更新、失败回滚和本地列表缓存同步。
- **2026-05-28**：详情页接入 `People` 字段，展示横滑演职人员头像、姓名和角色，缺头像时使用首字母占位。
- **2026-05-28**：详情页加载失败状态改为简短可读提示，原始错误只在折叠详情中显示并限制长度，避免 JSON body preview 直接撑满页面。
- **2026-05-29**：详情页接入 Emby/Jellyfin `Studios` 字段，Hero 内制作公司限制为单行展示，超出的公司折叠到 `+N` 浮层中查看；媒体库排序新增 `Bitrate` 选项。
- **2026-05-29**：详情页制作公司 pill 支持点击跳转；新增 `/studio/:id` 工作室详情页，按 `StudioIds` 或名称筛选作品，支持排序、分页加载、空状态/错误状态和海报卡片进入详情。
- **2026-05-29**：媒体集合 `BoxSet` 进入媒体库列表；通用海报卡片会读取 `PrimaryImageAspectRatio`，对合集自动选择横版或竖版布局，搜索结果也会请求该字段以保持卡片自适应。

---

## 8. Electron 迁移

- **2026-05-30**：Electron builder `win.icon` 指向 `src-tauri/icons/icon.ico`，portable 构建不再使用默认 Electron 图标。
- **2026-05-30**：Electron portable exe 完整性检查接入 `electron:dist`；最终发布文件会按 productName/version 自动定位并做存在性与最低体积检查。
- **2026-05-30**：发布启动脚本 `scripts/run-release.ps1` 支持 Electron unpacked、Electron portable 和 Tauri release 三个目标，默认 Electron unpacked，且可用 `-NoLaunch` 做无 GUI 验证。
- **2026-05-30**：Electron portable 目标已实际验证；`electron:dist` 生成 `release-electron\Hills Lite 0.1.0.exe`，并在 portable builder 后继续执行 `check:electron-package`。
- **2026-05-30**：Tauri 和 Electron 的 mpv 来源统一为仓库内置 `src-tauri/resources/mpv`；Tauri build script 移除本机目录环境变量、vendor bootstrap、GitHub 下载和 7z 解压，避免发布链路外隐式更新 mpv。
- **2026-05-30**：新增 Tauri release 完整性检查脚本；`tauri:build` 在 `tauri build` 后运行 `check:tauri-package`，确认 release exe 与随包 `resources/mpv` 完整。
- **2026-05-30**：侧边栏补齐下载管理、通知中心和远程遥控入口；已实现的 Electron 下载任务、通知抽屉和远程会话页现在可从主导航直接进入。
- **2026-05-30**：新增 Electron 打包完整性检查脚本；`electron:build` / `electron:dist` 在 builder 后运行 `check:electron-package`，确认 `app.asar`、unpacked exe 与随包 `resources/mpv` 文件完整，避免发布包缺失内置 mpv。
- **2026-05-30**：`electron:preview`、`electron:build` 与 `electron:dist` 在前端构建/发布前先执行 `check:electron-commands`，把 Electron 命令迁移覆盖从人工验证项提升为打包链闸门。
- **2026-05-30**：新增 Electron 命令覆盖检查脚本；扫描 `src` 下的 renderer invoke 命令，并与 `electron/main.mjs` 的 handler / `noOpCommands` 对齐，防止新增前端命令后落入未迁移兜底错误。
- **2026-05-30**：`package.json` 生产依赖保持为空，Vue/Pinia/hls.js/Tauri JS API 等构建期依赖移入 `devDependencies`；`electron/before-build.mjs` 返回 `false` 告知 Electron builder 运行时 `node_modules` 已外部处理，打包产物 `app.asar` 不再包含 `node_modules`，打包输出不再出现 duplicate dependency references、Node DEP0190 或空依赖 traversal fallback。
- **2026-05-30**：Electron 主进程注册 `hills-image` 协议，按服务器/线路/ItemId/图片类型/尺寸参数生成磁盘缓存键；未命中时带当前账号 token、线路 UA 和自定义 headers 拉图，命中时从 `.electron-user-data/image-cache` 返回。
- **2026-05-29**：Electron `noOpCommands` 清理为仅保留 `embed_attach`、`embed_set_rect`、`embed_set_visible`、`embed_detach`；`add_subtitle`、`remove_subtitle`、`set_subtitle_delay`、`set_subtitle_scale`、`set_subtitle_style` 和 `cycle_subtitle` 均继续由真实 mpv handler 执行，不再被迁移状态误标为占位命令。
- **2026-05-29**：`package.json` 补齐 Electron 打包 author 元数据，`npm.cmd run electron:build` 不再输出 `author is missed in the package.json`；重复依赖引用和 Node DEP0190 提示仍待后续单独清理。
- **2026-05-29**：新增一次性首启引导，启动数据刷新完成后按 `firstRunCompleted` 判断显示，提供服务器、播放器设置和首页入口；关闭或跳转后持久化完成状态，播放器全屏路由不显示。
- **2026-05-29**：设置页“同步”从占位改为 Trakt 同步基础面板，持久化同步启用状态、Trakt 用户名和观看记录/评分/收藏同步范围；侧边栏设置分类新增同步入口。
- **2026-05-29**：设置页关于面板补齐版本、运行壳、平台、服务器、账号、播放核心和打包产物状态；侧边栏与设置页入口统一显示“关于 Hills Lite”，并继续跳转/展开 `settings?c=about`。
- **2026-05-29**：设置页移除未接入真实配置后端的“语言 Auto”静态行，以及播放器分组中带箭头但不可展开的“交互”静态行；当前仅保留真实可操作的设置入口。
- **2026-05-29**：平台层新增普通 Web/Vite 预览回退；无 Electron bridge、无 Tauri runtime 时，设置、服务器、账号、下载、通知和基础媒体列表返回安全空数据，`update_settings` 使用内存合并，首启引导与设置页浏览器验证不再触发 Tauri IPC 错误。设置关于面板在该环境显示 `Web Preview` / `web`。
- **2026-05-29**：Web/Vite 预览不再挂载 mpv 缺失横幅；mpv 检测 IPC 已随本地路径入口一起移除，普通浏览器视觉验证不再依赖本机 mpv 环境。
- **2026-05-29**：设置页开始读取侧边栏传入的 `?c=` 分类参数，服务器、网络、播放器、快捷键、备份、外观、媒体库和关于分类会自动展开对应面板；侧边栏设置分类新增“备份”入口。
- **2026-05-29**：Electron 设置页“关闭时最小化到托盘”接入真实 `closeToTray` 设置，默认开启；主窗口关闭时会按该设置隐藏到托盘或退出，托盘菜单“退出”仍强制关闭应用。
- **2026-05-29**：Electron 设置页“备份与还原”接入配置导出/导入，备份文件包含设置、服务器、账号、当前账号和全局快捷键；导入默认合并同 id 项并刷新渲染层状态，不覆盖既有下载任务和通知。
- **2026-05-29**：Electron 桌面集成接入托盘、`rodelplayer://` 协议入口、single instance 深链转发、关闭隐藏到托盘和播放期间 `powerSaveBlocker` 防息屏；`set_now_playing*` / `clear_now_playing` 不再是空操作，托盘 tooltip 会显示播放状态、活动下载数和未读通知数。
- **2026-05-29**：Electron 弹幕源接入 DanDanPlay provider，`list_danmaku_providers` 返回真实列表，`fetch_danmaku` 会读取当前媒体详情、按剧集名匹配 DanDanPlay、拉取评论并转换为播放器弹幕格式；Electron 与 Tauri 侧使用一致的弹幕 User-Agent。
- **2026-05-29**：Electron 下载中心接入基础下载管理器，支持 Emby/Jellyfin 直连下载、Range 断点续写、暂停/继续/取消/移除、本地 mpv 播放和启动后恢复 running 任务；下载任务保存 headers/User-Agent 以便默认无 `api_key` 的鉴权路径可恢复。
- **2026-05-29**：Electron 远程遥控接入 Emby/Jellyfin `Sessions`、Playstate 与 GeneralCommand API，支持在线会话列表、播放暂停/停止/快退快进/进度跳转、音量设置和向远端设备发送消息，并过滤 Hills Lite 自己的会话。
- **2026-05-29**：Electron 通知中心命令接入 JSON 状态，支持列表、未读计数、删除、单条已读、全部已读和清空，并在操作后发出 `notification:*` 事件同步前端通知中心与 toast 队列。
- **2026-05-29**：Electron `list_subtitles` 从空实现改为按当前播放会话读取 Emby/Jellyfin PlaybackInfo，生成服务器字幕列表与可交给 mpv `sub-add` 的字幕 URL；停止播放或上报停止后会清空当前字幕会话，避免字幕面板显示上一条播放的字幕。
- **2026-05-29**：Electron 全局快捷键命令从空实现改为真实持久化与注册，支持列表、录制、解绑、重置和 `shortcut:trigger` 事件分发；Tauri 侧保存空快捷键数组后不再在重启时恢复默认，允许用户彻底解绑全部全局快捷键。
- **2026-05-28**：新增 `src/platform` 渲染层适配器，统一 `invoke`、事件监听、平台检测和文件选择，现有 Tauri API 改为懒加载 fallback。
- **2026-05-28**：新增 `electron/main.mjs` / `electron/preload.mjs`，建立 Electron BrowserWindow、`contextBridge`、dialog、platform 和受控 IPC invoke 入口。
- **2026-05-28**：`package.json` 新增 Electron 脚本与打包元数据；`package-lock.json` 已锁定 Electron、hls.js、electron-builder。
- **2026-05-28**：Electron 启动增加可写 userData/cache 与 GPU-safe 开关，并在启动时预加载状态；开发态使用项目内 `.electron-user-data`，打包态使用 exe 同级 `.electron-user-data`。`npm.cmd run electron:build` 当前生成 unpacked dir 产物，portable 单 exe 留待 NSIS/electron-builder 二进制缓存或镜像补齐。
- **2026-05-28**：Electron 主进程新增 JSON 状态存储和 Emby/Jellyfin 客户端，覆盖设置、服务器、账号、登录、媒体库、详情、搜索、季集、收藏/已看、线路测试和 HLS 播放源。
- **2026-05-28**：Electron 状态为空时会从旧 Tauri `C:\Users\Sakur\AppData\Roaming\app.embyplayer\config.json` 首次导入服务器、账号、设置、下载和通知，避免迁移后必须重新添加服务器。
- **2026-05-28**：播放页在 Electron 下改为单窗口 HTML5/HLS 播放，使用 `hls.js` 加载 m3u8，海报/背景作为加载态，进度、暂停、倍速、音量和静音走本地 video 控件状态；已接入播放进度/停止回报、选集上一集/下一集、播放结束自动下一集、HLS 致命错误提示和 HLS 网速采样。
- **2026-05-28**：修复 Electron 打包黑屏：Vite 产物改用相对 `./assets/...` 路径，避免 `file://` 下错误解析到 `file:///A:/assets/...` 导致 JS/CSS 未加载。重构目标是保留既有 Hills Lite Vue UI，只替换桌面壳、后端和播放管线。
- **2026-05-29**：Electron 默认播放核心改回 mpv：新增 Electron mpv IPC 控制器，打包 `resources/mpv/mpv.exe`，`play/pause/resume/stop/seek/speed/volume/audio/subtitle` 等命令走 mpv；HTML5/HLS 只保留为后备方向。
- **2026-05-29**：Electron mpv 启动改为 single-flight；空闲 `get_state` / 播放器状态轮询返回默认快照，暂停、拖动、音量、字幕等非播放命令在 mpv 未运行时 no-op，不再启动空播放器或弹出多个 mpv 窗口。mpv 日志写入 Electron 用户数据目录，便于继续定位黑屏/解码/鉴权问题。
- **2026-05-29**：新增产品路线 v2，明确保留 Hills Lite UI 风格、mpv/libmpv-first、连接器架构、PDP、弹幕、字幕、HDR/画质增强和桌面集成分期。
- **2026-05-29**：产品路线 v2 扩展为 ordered gates + feature lanes，覆盖在线媒体、文件服务、PDP、播放器、弹幕、字幕/AI、HDR/画质增强和桌面生态；Electron 播放请求增加串行队列，并合并同一 item/start/direct-play 的重复在途请求。详情页播放按钮和选集卡片在播放器路由跳转期间临时禁用，避免快速点击或路由/快捷键重入造成 mpv load 竞态。
- **2026-05-29**：Electron 播放链路新增可观测诊断：主进程将脱敏后的播放请求、播放源、MediaSource/线路信息、mpv `loadfile` 接受结果和失败原因写入 Electron 用户数据目录 `playback.log`；mpv 仍写入同目录 `mpv.log`。mpv 每次 load 会重新设置/清空 HTTP header list，并为直连流带上 `X-Emby-Token` 与 `Authorization`，用于定位黑屏、鉴权或源选择问题。

---

## 9. 验证 / 构建

```powershell
npm run build
cargo check --manifest-path src-tauri/Cargo.toml --all-targets
npm run tauri:build
```

最近验证：

```powershell
npm.cmd run build
npm.cmd run electron:build
```

本轮 Web Preview 服务器内存 fallback 的 `npm.cmd run build`、`npm.cmd run electron:build` 与行尾空白检查已通过；in-app Browser 打开 `http://127.0.0.1:1420/settings?c=servers` 后可在 Web Preview 中添加 `Web 预览服务器`，保存后列表显示 `https://preview.test/`、`UA` 与 `Headers 1`，再次编辑 headers 为两行后显示 `Headers 2`，控制台 error 数为 0。

本轮 Electron release mpv 章节跳转真实冒烟的 `@'<redacted real mpv chapter smoke>'@ | node --input-type=module -` 已确认章节样本 `16240` 在随包 mpv 中返回 3 个章节：Opening `0ms`、Story `90007ms`、Ending `1339965ms`；跳转到 Story 后 `positionMs = 90007`、`activeChapter = 1`，误差小于 2 秒。

本轮 Electron release mpv 控制项真实冒烟的 `@'<redacted real mpv controls smoke>'@ | node --input-type=module -` 已确认线路1真实媒体 `21648` 在随包 mpv 中有视频轨 1 条、音频轨 1 条、字幕轨 2 条；`sid = 1` 切换、`sid = no` 关闭、`stats/display-page-1` 与 `screenshot-to-file` 均成功，临时截图大小 `6990409` bytes 并已删除。该媒体章节数为 0，章节跳转未覆盖。

本轮服务器线路高级配置的 `npm.cmd run build`、`cargo fmt --manifest-path src-tauri\Cargo.toml --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、`npm.cmd run check:electron-commands`、`npm.cmd run electron:build` 与行尾空白检查已通过；in-app Browser 打开 `http://127.0.0.1:1420/settings?c=servers` 成功，添加服务器弹窗的默认 UA、线路 UA 与 headers 输入可见可填，控制台 error 数为 0。Web 预览未实现 `add_server`，因此浏览器未做真实保存。

本轮 Electron release 随包 mpv 真实播放冒烟的 `@'<redacted real playback smoke>'@ | node --input-type=module -` 已确认 `resolveMpv()` 命中 `release-electron\win-unpacked\resources\mpv\mpv.exe`，线路1真实媒体 `21648` 被 mpv accepted，IPC 快照返回 `positionMs = 1250`、`durationMs = 866026`、`trackCount = 4`、H.264 视频、AAC 音频、`paused = false`、`eof = false`、`buffering = false`。

本轮真实线路播放源验证的 `node --input-type=module -e "<redacted real-line playback source smoke>"` 已确认线路1可登录并构造 `mpv-direct-static` 播放源；线路2的 `PlaybackInfo`、`Users/{userId}/Views` 与直连流 Range GET 均返回 Cloudflare HTTP 403，默认 UA / 浏览器 UA 对照一致，验证过程未写入 token、密码或完整播放 URL。

本轮播放源切换的 `node --check electron\backend\emby.mjs`、`node --check electron\main.mjs`、`npm.cmd run check:electron-commands`、`cargo fmt --manifest-path src-tauri\Cargo.toml --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、`npm.cmd run build`、`npm.cmd run electron:build` 与行尾空白检查已通过；Electron unpacked 产物继续确认 `app.asar` 和 6 个随包 mpv 文件完整。尝试用 in-app Browser 打开 `http://127.0.0.1:1420/` 做本地视觉冒烟时被浏览器安全策略拒绝，未绕过；线路1后续继续做 Electron release 真实播放冒烟，线路2需上游放行后再验证切线播放。

本轮截图字幕开关的 `node --check electron\backend\store.mjs`、`cargo fmt --manifest-path src-tauri\Cargo.toml`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、`node --check electron\main.mjs`、`npm.cmd run build`、行尾空白检查、`npm.cmd run electron:build` 已通过；未做真实截图文件的人工对比验证。

本轮截图保存提示优化的 `node --check electron\main.mjs`、`cargo fmt --manifest-path src-tauri\Cargo.toml --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、`npm.cmd run build`、行尾空白检查、`openPath/open_path` 调用点检查、`npm.cmd run electron:build` 已通过；未做真实播放器截图后点击“打开目录”的人工验证。

本轮截图路径复制的 `writeTextToClipboard/copyScreenshotPath` 落点检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；未做真实播放器截图后点击“复制路径”的人工剪贴板验证。

本轮播放器面板互斥的面板切换入口检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；未做真实播放器窗口里逐个点击弹层的人工视觉目检。

本轮播放器错误复制的错误复制落点检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；未做真实播放失败场景下点击“复制错误”的人工剪贴板验证。

本轮播放器错误重试的启动逻辑复用落点检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；本轮构建中 PlayerView chunk 已低于 500 kB，未再出现 chunk 体积提示；未做真实播放失败场景下点击“重试”的人工恢复验证。

本轮播放器重试防连点的 `retryingPlayback` 落点检查、重试按钮检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；PlayerView chunk 仍低于 500 kB；未做真实失败浮层里连续点击“重试”的人工验证。

本轮 Electron 打包 author 元数据的 JSON author 校验、author 落点检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；`author is missed in the package.json` 已消失，仍有既有 duplicate dependency references 和 Node DEP0190 提示。

本轮播放器错误重试快捷键的快捷键落点检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；author 缺失警告保持消失；未做真实错误浮层中按 `r` 的人工验证。

本轮移除 Anime4K 占位入口的 `Anime4K`/`class="pro"` 残留检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；未做真实播放器设置菜单人工视觉目检。

本轮移除播放器版本占位按钮的 `title="版本"`/`lucide:clapperboard` 残留检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；未做真实播放器底栏人工视觉目检。

本轮移除详情页静态媒体选择器的静态状态/模板/样式残留检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；未做真实详情页 Hero 人工视觉目检。

本轮详情页分享复制的剪贴板工具落点检查、单实现检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；未做真实详情页点击分享后的人工剪贴板验证。

本轮移除详情页查看全部占位按钮的 `查看全部`/`link-btn` 残留检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；未做真实详情页剧集区人工视觉目检。

本轮设置关于入口去 Pro 化的 `Hills Lite Pro`/`pro-btn`/`lucide:crown`/`PanelId` 残留检查、关于入口落点检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；未做真实设置页/侧边栏人工视觉目检。

本轮移除设置页静态占位行的“语言”/“交互”残留检查、`row--static` 落点检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；未做真实设置页人工视觉目检。

本轮 Web 预览平台回退的 `invokeWebFallback`/`Web Preview` 落点检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；并用浏览器验证 `http://127.0.0.1:5173/` 可关闭首启引导、进入设置、展开“关于 Hills Lite”，无新增控制台 error，且无 `Hills Lite Pro` / `语言 Auto` / `交互` 残留。

本轮 Web 预览隐藏 mpv 检测横幅的 `detect_mpv` 回退落点检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；并用浏览器验证 `http://127.0.0.1:5173/` 首页空状态无“未检测到 mpv 播放器内核”/“下载 mpv”横幅内容，且无新增控制台 error。

本轮内置 mpv 播放核心固定化的 `mpvExecutablePath`/`mpv_executable_path`/`detect_mpv`/`detectMpv`/`MpvBanner`/本机 mpv 提示文案/`where.exe`/`spawnSync`/`which` 残留检查、`node --check electron\main.mjs`、`node --check electron\backend\mpv.mjs`、`cargo fmt --manifest-path src-tauri\Cargo.toml --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；Electron 打包产物已确认存在 `release-electron\win-unpacked\resources\mpv\mpv.exe`（约 120 MB）及 `libmpv-2.dll` 等随包文件；浏览器验证设置页播放器面板无本机 mpv 检测/下载/路径入口且无新增控制台 error。

本轮 Electron 字幕 no-op 清理的 API/Electron command coverage 脚本检查、字幕命令 handler/no-op 状态检查、`node --check electron\main.mjs`、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；Electron builder 仍有既有 duplicate dependency references 和 Node DEP0190 提示。

本轮播放器卸载并行清理的 `cleanupTasks` / `Promise.allSettled` 落点检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；Electron builder 仍有既有 duplicate dependency references 和 Node DEP0190 提示，未做真实播放窗口关闭时的人工耗时对比。

本轮启动期线路可达性探测的 `probeAllLines` / `Promise.allSettled` / `App.vue` 启动接线落点检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；Electron builder 仍有既有 duplicate dependency references 和 Node DEP0190 提示，未在真实已配置服务器环境里等待网络探测结果做人工对比。

本轮服务器图标 fallback 统一的 `serverVisuals` / `AppSidebar` / `HomeView` 落点检查、`srv-row__play` / `serverInitial` 残留检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；浏览器验证 `http://127.0.0.1:5173/` shell 与空服务器状态正常渲染，验证开始后无新增 console error；当前 Web 预览无已保存服务器，未目检真实服务器行里的连接器头像和健康点。

本轮媒体库分区标题常显的 `currentView` / `libraryTitle` / `refreshHome` 落点检查、固定“媒体库”标题残留检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；Electron builder 仍有既有 duplicate dependency references 和 Node DEP0190 提示，未在真实媒体库数据下做人工视觉目检。

本轮 PDP Episode 并行加载的 `Promise.all` / `episodeLoadSeq` / `suppressNextSeasonWatch` / stale guard 落点检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；Electron builder 仍有既有 duplicate dependency references 和 Node DEP0190 提示，未在真实剧集详情数据下做人工视觉目检。

本轮 Electron 图片缓存的 `node --check electron\main.mjs`、`hills-image`/`mediaImages`/直接拼图 URL 落点检查、行尾空白检查、`npm.cmd run electron:build`、重跑后的 `npm.cmd run build` 已通过；`npm.cmd run build` 首次触发既有 Vite HTML 偶发错误后重跑通过；浏览器冷开 `http://127.0.0.1:1420/` 空数据 shell 正常且无应用自身新增 console/page error，未在真实已配置媒体服务器下抓包验证图片缓存命中。

本轮播放器快捷键中央分发的 `PLAYER_SHORTCUTS` / `PLAYER_SHORTCUT_SUMMARY` / `useKeyboard` 落点检查、`+` 键解析落点检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；Electron builder 仍有既有 duplicate dependency references 和 Node DEP0190 提示，未在真实播放会话中逐个按键人工实测。

本轮 composition resize 节流的 `stageEl` / `ResizeObserver` / `scheduleEmbedRectSync` / `embedSetRect` 落点检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；Electron builder 仍有既有 duplicate dependency references 和 Node DEP0190 提示，当前默认 `embedVideo` 仍关闭，未做真实 WID/composition 内嵌窗口 resize 视觉实测。

本轮播放器控制栏宽度档位的 `data-hide-below` / `data-control` / 1180px / 920px / 620px 落点检查、无音轨占位按钮残留检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；Electron builder 仍有既有 duplicate dependency references 和 Node DEP0190 提示，未在真实播放会话中做控制栏 resize 人工目检。

本轮 Electron 运行时依赖打包清理的 `beforeBuild` / 空生产依赖落点检查、`node --check electron\before-build.mjs`、`npm.cmd install --package-lock-only`、`npm.cmd ls --include=prod --omit=dev --depth=0`、JSON 解析检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build`、`app.asar` node_modules 条目检查与打包内 `package.json` 依赖检查已通过；`electron:build` 输出已无 duplicate dependency references、Node DEP0190 和空依赖 traversal fallback。

本轮 Electron 命令覆盖检查的 `node --check scripts\check-electron-command-coverage.mjs`、`npm.cmd run check:electron-commands`、`package.json` JSON 解析检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；当前 85 个 renderer 命令全部被 81 个 Electron handler 与 4 个显式 embed no-op 覆盖。

本轮 Electron 命令检查打包闸门的 `package.json` / `package-lock.json` JSON 解析检查、`check:electron-commands` 脚本接线检查、行尾空白检查、`npm.cmd run check:electron-commands`、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；`electron:build` 已确认先运行命令覆盖检查再进入 Vite 构建与 Electron builder，`electron:dist` 已静态确认同样接线但本轮未实际生成 portable 包。

本轮 Electron 打包完整性闸门的 `node --check scripts\check-electron-package.mjs`、`package.json` / `package-lock.json` JSON 解析检查、脚本接线检查、行尾空白检查、`npm.cmd run check:electron-package`、`npm.cmd run electron:build` 已通过；`electron:build` 已确认按命令覆盖检查、Vite 构建、Electron builder、打包完整性检查顺序执行，产物中 6 个随包 mpv 文件已复制到 `release-electron\win-unpacked\resources\mpv`，总量 213.7 MiB，`app.asar` 存在。

本轮侧边栏工具入口补齐的入口落点检查、设置分类残留检查、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；浏览器冷开 `http://127.0.0.1:1420/` 后确认“下载 / 通知 / 遥控”可见，下载入口进入空任务状态，遥控入口进入无在线会话状态，通知入口打开通知中心，且无新增控制台 error。

本轮 Tauri 随包 mpv 构建固定化的旧下载/本机路径残留检查、`cargo fmt --manifest-path src-tauri\Cargo.toml --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、Tauri debug runtime mpv 复制检查、`cargo build --manifest-path src-tauri\Cargo.toml --release`、Tauri release runtime mpv 复制检查、行尾空白检查、`npm.cmd run electron:build` 已通过；`src-tauri\target\debug\resources\mpv\mpv.exe`、`src-tauri\target\release\emby-player.exe` 与 `src-tauri\target\release\resources\mpv\mpv.exe` 已确认存在，release 随包 mpv 目录含 6 个文件，随包复制失败路径已改为硬失败，旧 `HILLS_LITE_MPV_DIR`、`vendor/mpv`、`download_mpv`、`sevenz-rust`、`mpv-winbuild` 残留已清除。

本轮 Tauri 打包完整性闸门的 `node --check scripts\check-tauri-package.mjs`、`package.json` JSON 解析检查、脚本接线检查、行尾空白检查、`npm.cmd run check:tauri-package`、`npm.cmd run tauri:build` 已通过；`tauri:build` 已确认执行前端构建、Tauri release 构建和后置完整性检查，`src-tauri\target\release\emby-player.exe` 存在，release `resources\mpv` 中 6 个随包 mpv 文件总量 213.7 MiB。

本轮 Electron portable 发布包验证的 `npm.cmd run electron:dist` 已通过；首次 sandbox 运行因 NSIS 缓存下载被阻止，授权联网补齐 `nsis-3.0.4.1` 与 `nsis-resources-3.4.1` 后重跑成功。已确认 `release-electron\Hills Lite 0.1.0.exe` 存在且大小为 148,865,089 bytes，`release-electron\win-unpacked\resources\mpv\mpv.exe` 存在且大小为 120,320,512 bytes，`electron:dist` 末尾已执行 `check:electron-package`。

本轮 Electron Windows 图标接入的 `package.json` JSON 解析检查、图标文件存在性检查、Electron builder 图标配置落点检查、行尾空白检查、`npm.cmd run electron:dist`、portable 文件存在性检查已通过；构建日志不再出现 `default Electron icon is used`，重新生成的 `release-electron\Hills Lite 0.1.0.exe` 大小为 148,937,281 bytes，末尾仍执行 `check:electron-package`。

本轮 Electron portable 完整性闸门的 `node --check scripts\check-electron-dist.mjs`、`package.json` JSON 解析检查、脚本接线检查、行尾空白检查、`npm.cmd run check:electron-dist`、`npm.cmd run electron:dist` 已通过；`electron:dist` 已确认依次执行命令覆盖检查、Vite build、portable builder、`check:electron-package` 与 `check:electron-dist`，最终 portable 文件 `release-electron\Hills Lite 0.1.0.exe` 通过 50 MiB 最低体积检查。

本轮发布启动脚本目标化的 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-release.ps1 -Target electron -NoLaunch`、`-Target portable -NoLaunch`、`-Target tauri -NoLaunch`、脚本接线检查、行尾空白检查已通过；三种目标均能定位现有 release 产物且不会在 `-NoLaunch` 下启动 GUI。

本轮播放器 Stats 分页与 mpv OSD 模式的 `node --check electron\main.mjs`、`node --check electron\backend\mpv.mjs`、`node --check electron\backend\store.mjs`、`npm.cmd run check:electron-commands`、`npm.cmd run build`、`cargo fmt --manifest-path src-tauri\Cargo.toml --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、落点检查、行尾空白检查、`npm.cmd run electron:build` 已通过；浏览器验证设置页可见“统计浮层 / WinUI / mpv OSD”，可切到 mpv OSD 并切回 WinUI，控制台 error 为空。直接冷开播放器路由在 Web 预览无账号环境下仍被首启引导拦住，因此未做真实播放会话内 Stats 五页人工点击。

本轮内置 mpv resolver 与 QA 脚本收紧的 `node --check electron\backend\mpv.mjs`、旧 `vendor/mpv` / system mpv / detect mpv 残留检查、落点检查、行尾空白检查、`powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-playback-flow.ps1 -SkipBuild`、`npm.cmd run check:electron-package`、`npm.cmd run electron:build` 已通过；QA 脚本已确认 `dist\index.html`、Tauri release exe 和 `src-tauri\target\release\resources\mpv\mpv.exe` 存在，Electron 打包仍确认 6 个随包 mpv 文件进入 `release-electron\win-unpacked\resources\mpv`。

本轮播放器快退快进按钮的 `npm.cmd run build`、行尾空白检查、`npm.cmd run electron:build` 已通过；未做真实播放中的按钮点击人工实测。

本轮弹幕热度条的 `npm.cmd run build`、行尾空白检查、`npm.cmd run electron:build` 已通过；未做真实弹幕媒体播放下的人工热度条目检。

本轮自动跳过片头片尾的 `node --check electron\backend\store.mjs`、`cargo fmt --manifest-path src-tauri\Cargo.toml`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、`node --check electron\main.mjs`、`npm.cmd run build`、行尾空白检查、`npm.cmd run electron:build` 已通过；未做真实连续剧播放队列中的人工跳片头/片尾实测。

本轮字幕样式控制的 `node --check electron\main.mjs`、`node --check electron\backend\store.mjs`、`cargo fmt --manifest-path src-tauri\Cargo.toml`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、`npm.cmd run build`、静态 `dist` 首屏浏览器加载、行尾空白检查、`npm.cmd run electron:build` 已通过；未做真实视频字幕样式渲染实测，也未在真实播放会话里打开字幕面板做人工视觉目检。

本轮弹幕避让字幕的 `node --check electron\backend\store.mjs`、`cargo fmt --manifest-path src-tauri\Cargo.toml`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、`npm.cmd run build`、`node --check electron\main.mjs`、行尾空白检查、`npm.cmd run electron:build` 已通过；未做真实视频里“字幕 + 弹幕”同屏人工目检。

本轮切轨保留缓存的 `node --check electron\main.mjs`、`node --check electron\backend\store.mjs`、`cargo fmt --manifest-path src-tauri\Cargo.toml`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、`npm.cmd run build`、行尾空白检查、`npm.cmd run electron:build` 已通过；未做真实媒体播放中的人工切轨实测。

本轮全屏副屏遮黑的 `node --check electron\main.mjs`、`node --check electron\backend\store.mjs`、`cargo fmt --manifest-path src-tauri\Cargo.toml`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、`npm.cmd run build`、`Test-Path dist\blackout.html`、行尾空白检查、`npm.cmd run electron:build` 已通过；未做真实多显示器人工视觉实测。

本轮播放器章节列表的 `node --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过。

本轮播放器截图的 `node --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过。

本轮播放器窗口置顶的 `node --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过。

本轮播放器 Stats 浮层的行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过。

本轮 Windows HDR 设置入口的行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过。

本轮首启引导基础的 `node --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过。

本轮 JAV 番号过滤的 `node --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过。

本轮同步设置基础的 `node --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过。

本轮外部播放器基础配置的 `node --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过。

本轮详情页附加内容的 `node --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过。

本轮弹幕持久设置的 `node --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过。

结果：通过；Electron unpacked 产物为 `release-electron\win-unpacked\Hills Lite.exe`。本轮设置关于面板的 `npm.cmd run build`（首次 Vite HTML 输出瞬时异常后重跑通过）、行尾空白检查、`npm.cmd run electron:build` 已通过；本轮聚合视界实用化的 `npm.cmd run build`、行尾空白检查、`npm.cmd run electron:build` 已通过；本轮详情页相似内容的 `node --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；本轮播放历史入口的 `node --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；本轮详情页外部链接的 `node --check`、`npm.cmd run build`、行尾空白检查、`npm.cmd run electron:build` 已通过；本轮设置分类导航接线的 `npm.cmd run build`、行尾空白检查、`npm.cmd run electron:build` 已通过；Electron 关闭到托盘设置的 `node --check`、`npm.cmd run build`、行尾空白检查、`npm.cmd run electron:build` 已通过；Electron 配置备份与还原的 `node --check`、`npm.cmd run build`、行尾空白检查、`npm.cmd run electron:build` 已通过；Electron 桌面集成的 `node --check`、`npm.cmd run build`、行尾空白检查、`npm.cmd run electron:build` 已通过；Electron 弹幕源接入的 `node --check`、`npm.cmd run build`、行尾空白检查、`npm.cmd run electron:build` 已通过；Electron 基础下载管理器的 `node --check`、`npm.cmd run build`、行尾空白检查、`npm.cmd run electron:build` 已通过；Electron 远程遥控的 `node --check`、`npm.cmd run build`、行尾空白检查、`npm.cmd run electron:build` 已通过；Electron 通知中心持久化的 `node --check`、`npm.cmd run build`、行尾空白检查、`npm.cmd run electron:build` 已通过；Electron 服务器字幕列表的 `node --check`、`npm.cmd run build`、行尾空白检查、`npm.cmd run electron:build` 已通过；详情页类型与剧集进度的 `npm.cmd run build`、行尾空白检查、`npm.cmd run electron:build` 已通过，浏览器目检因本地 Vite 服务未能保持端口监听而未执行；快捷键解绑持久化的 `node --check`、`npm.cmd run build`、`cargo check --manifest-path src-tauri/Cargo.toml --all-targets`、行尾空白检查、`npm.cmd run electron:build` 已通过；首页巨幕轮播的 `node --check`、`npm.cmd run build`、`cargo check --manifest-path src-tauri/Cargo.toml --all-targets`、行尾空白检查、`npm.cmd run electron:build` 已通过；集合卡片自适应的 `node --check`、`npm.cmd run build`、`cargo check --manifest-path src-tauri/Cargo.toml --all-targets`、行尾空白检查、`npm.cmd run electron:build` 已通过；弹幕菜单与合并的 `npm.cmd run build`、行尾空白检查、`npm.cmd run electron:build` 已通过；播放器画面模式的 `node --check`、`npm.cmd run build`、`cargo check --manifest-path src-tauri/Cargo.toml --all-targets`、行尾空白检查、`npm.cmd run electron:build` 已通过；授权查询参数开关的 `node --check`、`npm.cmd run build`、`cargo check --manifest-path src-tauri/Cargo.toml --all-targets`、行尾空白检查、`npm.cmd run electron:build` 已通过；播放队列标题格式的 `npm.cmd run build`、行尾空白检查、`npm.cmd run electron:build` 已通过；播放器缓存进度的 `node --check`、`npm.cmd run build`、`npm.cmd run electron:build` 已通过；弹幕开关高亮的 `npm.cmd run build`、`npm.cmd run electron:build` 已通过；弹幕 User-Agent 的 `cargo check --manifest-path src-tauri/Cargo.toml --all-targets` 已通过；工作室详情页的 `npm.cmd run build`、`npm.cmd run electron:build` 已通过；PDP 制作公司/比特率排序的 `node --check` 与 `cargo check --manifest-path src-tauri/Cargo.toml --all-targets` 已通过。上一轮完整 Tauri release 构建产物仍为 `src-tauri\target\release\emby-player.exe`。

本轮外部 XML 弹幕导入已闭环：播放器弹幕菜单新增“导入 XML”，Electron/Tauri/Web Preview 均接入 `import_danmaku_xml`；解析器支持常见 `<d p="time,mode,size,color,...">text</d>` XML，能够解析时间、模式、颜色与实体转义。验证已覆盖 `node --check electron\backend\danmaku.mjs`、`node --check electron\main.mjs`、Node XML 解析 smoke、`cargo fmt --manifest-path src-tauri\Cargo.toml --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、`npm.cmd run check:electron-commands`、`npm.cmd run build`、本阶段触碰文件行尾空白检查与 `npm.cmd run electron:build`。

本轮播放源切换运行时补齐已闭环：Tauri `play` / `play_external` 支持 `lineId` 与 `mediaSourceId` 指定候选开流，当前播放会话记录 `lineId`，服务器字幕列表按会话线路重新请求 `PlaybackInfo` 与拼接字幕 URL；Electron 外部播放器入口同步透传线路 / 媒体源选择。验证已覆盖 `node --check electron\main.mjs`、Electron 假 `PlaybackInfo` 指定 `line-b/source-b` smoke、`cargo fmt --manifest-path src-tauri\Cargo.toml --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、`npm.cmd run check:electron-commands`、本阶段触碰文件行尾空白检查、`npm.cmd run build` 与 `npm.cmd run electron:build`。

本轮当前工作树真实线路切源复核确认：线路1可登录并按显式 `lineId/mediaSourceId` 构造 `mpv-direct-static` / `direct-stream` 播放源，候选线路数 2、候选媒体源数 1；线路2显式切源请求 `PlaybackInfo` 仍返回 Cloudflare HTTP 403。线路1媒体流 Range GET 返回 HTTP 200、`video/x-matroska` 与首个 3061 bytes，但 Electron release 随包 mpv 无日志加载 35 秒后快照仍未拿到时长或轨道，因此本轮不将 mpv 真实加载复核记为通过。用户已明确指出播放窗口应内嵌，下一阶段优先处理内嵌播放体验。

本轮服务器识别与登录一条流已闭环：添加服务器弹窗补齐自动识别、端口、用户名和密码输入，填写账号后可保存并立即登录；Electron/Tauri 新增 `detect_server`，Web Preview 补齐内存账号态。验证已覆盖 `node --check electron\backend\emby.mjs`、`node --check electron\main.mjs`、`npm.cmd run check:electron-commands`、`cargo fmt --manifest-path src-tauri\Cargo.toml`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、`npm.cmd run build`、Electron 自动识别 smoke、真实测试账号 443 线路登录 smoke、in-app browser 表单目检与 `npm.cmd run electron:build`；验证过程未写入密码、token 或完整播放地址。

本轮播放窗口内嵌宿主接线已完成：前端在 Electron/Tauri 运行时启用内嵌，Electron `embed_*` 改为创建应用托管宿主窗口并把原生句柄传给 mpv，Tauri IPC 启动 mpv 时也补齐 `--wid`；控制栏显示时的嵌入 rect 会避开顶部/底部控制区。验证已覆盖 `node --check electron\backend\mpv.mjs`、`node --check electron\main.mjs`、`npm.cmd run check:electron-commands`、`cargo fmt --manifest-path src-tauri\Cargo.toml --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、`npm.cmd run build`、行尾空白检查、Electron 运行时 `embed_*` 命令 smoke、Electron 临时 userData 真实内嵌播放 smoke 与 `npm.cmd run electron:build`；真实播放 smoke 返回有效时长、4 条轨道和播放中状态，验证过程未写入密码、token 或完整播放 URL。

本轮 Electron 内嵌黑屏修复已闭环：原 Win32 child HWND 会被 Chromium 合成层挡住，已改为由主窗口拥有的无边框 popup 宿主窗口；mpv 自截图与屏幕截图均返回彩色视频像素，恢复硬解设置后 smoke 仍通过。验证已覆盖 `node --check electron\backend\mpv.mjs`、`node --check electron\main.mjs`、`node --check scripts\smoke-electron-embedded-local.mjs`、`node --check scripts\check-electron-package.mjs`、`cargo fmt --manifest-path src-tauri\Cargo.toml`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、`npm.cmd run check:electron-commands`、Electron embedded smoke、`npm.cmd run build:electron-helper` 与 `npm.cmd run electron:build`；Electron unpacked 产物已确认包含 `resources\electron_mpv_host.exe`。

本轮添加服务器账号入口可见性已修正：账号区移到线路区之前，用户名、密码、端口和自动识别入口在 1280x720 预览首屏同时可见；弹窗内容区补齐 `min-height: 0`，避免底部按钮栏压住输入。验证已覆盖 in-app Browser 目检、`npm.cmd run build` 与本阶段触碰文件行尾空白检查。

本轮内嵌视觉临时脚本已清理：删除上一轮遗留的 `scripts/smoke-electron-embedded-visual.mjs`，并确认仓库内未检出测试账号名或密码明文。后续真实联调只使用临时进程参数或环境变量承载敏感字段。

---

## 10. Phase 2 待办

- 播放窗口内嵌已通过本地屏幕像素 smoke；后续仍建议用真实媒体人工走一遍控制栏显示/隐藏、全屏和窗口 resize 体验。
