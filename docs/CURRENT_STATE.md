# Hills Lite — 当前项目状态快照

> **更新时间**：2026-06-01（未引用图标资源清理）
>
> **规格**：[`UI_REFERENCE_HILLS_LITE.md`](./UI_REFERENCE_HILLS_LITE.md)
>
> **变更日志**：[`CHANGE_LOG/2026-06-01-1558-unused-icon-cleanup.md`](./CHANGE_LOG/2026-06-01-1558-unused-icon-cleanup.md)

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

**2026-06-01**：资源清理阶段删除未被 Electron builder 或 `tauri.conf.json` 引用的默认移动端/商店图标，只保留桌面构建实际引用的 `32x32.png`、`128x128.png`、`128x128@2x.png`、`icon.icns` 与 `icon.ico`。`blackout.html`、Tauri schema、随包 mpv 和实际功能模块未清理。

**2026-06-01**：详情页“媒体信息”的播放能力文案同步本机解码硬约束：可用能力只显示“本机直连 / 本机直流”；如果媒体源只能依赖服务端转码，则显示“仅服务端转码（不可播放）”，不再把转码包装成可用播放能力。

**2026-06-01**：设置页服务器编辑继续收敛到线路级配置：服务器级默认 User-Agent 不再显示，保存时清空为 `null`；每条线路保留名称、URL、启用开关，User-Agent 与 Headers 移入“高级”折叠区，避免和添加服务器流程重复。播放链路仍延续本机解码硬约束，不允许服务端转码。

**2026-05-29**：设置页新增“媒体库 → 首页轮播图风格”，可在标准与巨幕之间切换；巨幕模式使用更高的 Hero 高度、更大的标题布局和 2200px 背景图请求。

**2026-05-29**：侧边栏新增“历史”入口与 `/history` 页面，按最近播放时间展示已看电影/剧集，支持全部/电影/剧集筛选、刷新和分页加载。

**2026-05-29**：聚合视界从占位页改为可用入口，聚合当前账号的搜索、继续观看、收藏和最近看过内容，并提供概览/收藏/历史分段切换。

**2026-05-29**：服务器连接器图标与活动线路 fallback 抽到 `src/utils/serverVisuals.ts`；侧边栏服务器项使用统一连接器头像并显示线路健康点，首页未登录服务器卡片复用同一套图标/线路解析。

**2026-05-30**：媒体库分区页顶部标题改为常显当前分区名称；直达 `/library/:id` 且视图缓存为空时，会在加载媒体条目的同时并行补拉视图元数据，长标题保持单行省略。

**2026-05-31**：Web/Electron dev 预览冷开深链接会把非 `file://` 的浏览器 path/query 同步进 memory router，`/settings?c=sync` 可直接展开对应设置面板，`/downloads?task=...` 可直接进入下载页；Electron 打包 `file://.../index.html` 不参与该同步，避免把本地文件路径误当成前端路由。

**2026-05-31**：设置页新增“文件服务 / 连接器”只读能力面板，可通过 `/settings?c=file-services` 直达；本地单文件、最近本地文件、同名字幕、同名 XML 弹幕标记为可用，文件夹媒体库、WebDAV、SMB、Alist/OpenList、Plex 连接器标记为待接入。

**2026-05-31**：新增 `/local-folder` 本地文件夹页面；Electron/Tauri 提供 `list_local_folder` 命令枚举所选目录第一层常见视频文件，侧边栏“打开本地文件夹”可进入列表，点击视频继续走 `/player/local-file?file=...` 本地播放器链路。设置页“文件服务 / 连接器”面板同步将“文件夹媒体库”标记为可用。

**2026-06-01**：本地文件夹播放接入播放器队列；从 `/local-folder` 点击视频会把当前列表写入本地队列，播放器上一集/下一集和选集菜单显示文件名并切换本地文件，返回按钮会回到来源文件夹。

**2026-06-01**：最近本地文件夹接入客户端本地状态；侧边栏底部显示最近 2 个本地文件夹，`/local-folder` 空状态显示最近 6 个文件夹快捷入口，成功打开或加载文件夹后会写入最近记录。

**2026-06-01**：本地文件夹浏览新增“包含子文件夹”模式；Electron/Tauri `list_local_folder` 可递归扫描子目录并返回相对路径，页面列表显示子目录路径，超过 500 个视频时会截断并提示。

**2026-06-01**：`/local-folder` 新增当前列表搜索筛选；可按文件名、相对路径和扩展名过滤递归扫描结果，计数显示筛选数 / 总数，点击播放时本地队列跟随筛选后的列表。

**2026-06-01**：本地文件夹新增收藏入口；当前文件夹可星标收藏，侧边栏和 `/local-folder` 空状态会显示收藏本地文件夹快捷入口，收藏记录仅保存在当前客户端。

**2026-06-01**：`/local-folder` 新增排序下拉，可按路径、文件名、最近修改和大小整理当前扫描结果；播放队列跟随搜索与排序后的可见列表。

**2026-06-01**：本地文件夹列表新增单个视频收藏；文件行可星标收藏/取消收藏，侧边栏底部显示收藏本地文件并避开最近本地文件重复项，收藏记录仅保存在当前客户端。

**2026-06-01**：本地文件夹列表新增同名封面识别；Electron/Tauri 扫描同目录 `.jpg/.jpeg/.png/.webp/.avif/.bmp`，同名图片优先，`poster`、`cover`、`folder` 图片兜底，文件行会显示本地缩略图并在加载失败时回退视频图标。

**2026-06-01**：本地文件夹页新增系统定位入口；工具栏可打开当前文件夹，文件行可打开视频所在目录，设置页“文件服务 / 连接器”同步将“本地文件定位”标记为可用。

**2026-06-01**：本地文件夹列表新增同名 `.nfo` 元数据读取；Electron/Tauri 扫描视频同目录同名 NFO，提取标题、年份和简介，文件行优先显示 NFO 标题并让搜索匹配元数据内容。

**2026-06-01**：本地文件夹递归浏览新增按子目录分组显示；开启“按文件夹分组”后，列表按视频相对路径的父目录生成分组标题，播放队列仍跟随当前搜索和排序结果。

**2026-06-01**：本地文件夹列表新增侧挂资源提示；Electron/Tauri 返回同名字幕数量和同名 XML 弹幕路径，文件行显示“字幕 N”与“XML 弹幕”，搜索可匹配字幕/弹幕关键词。

**2026-06-01**：新增 `/webdav` WebDAV 基础连接器；侧边栏可进入 WebDAV 页面，连接表单支持 URL、用户名、密码和可选凭据保存，Electron 后端使用真实 PROPFIND 读取目录并把可播放视频直链交给内嵌 mpv，Web Preview 通过本地代理提供目录浏览验证路径。设置页“文件服务 / 连接器”同步将 WebDAV 标记为可用。

**2026-06-01**：WebDAV 播放接入播放器队列；从 `/webdav` 点击视频会把当前目录内可播放视频写入 direct queue，播放器上一条/下一条和选集菜单显示 WebDAV 文件名，返回按钮回到来源 WebDAV 目录。

**2026-06-01**：详情页新增“媒体信息”摘要区；Emby/Jellyfin 详情接口会请求 `MediaSources`，页面展示媒体源、容器、视频编码/分辨率/码率、音频、字幕数量、总码率、大小和播放能力，且不展示完整服务器路径或远端 URL。

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

**2026-06-01**：播放器画面区域新增长按倍速手势；按住非控件区域 420ms 后临时切到 2.0x，并显示居中 `2.0x` 徽标，松开后恢复原倍速。控件、进度条、菜单、提示和错误浮层不触发，移动超过阈值会取消未触发的长按。

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
- **2026-06-01**：当前 `main` 再次完成 Electron 内嵌播放冒烟复核：`scripts\smoke-electron-embedded-local.mjs` 使用本地假 Emby 与临时彩色视频进入 `/player/local-embedded-smoke`，mpv 返回 12 秒时长、播放中状态和 2 条轨道，屏幕截图与 mpv 截图均检测到彩色视频像素，确认桌面内嵌路径非黑屏。
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
- **2026-06-01**：Web Preview 详情请求补齐超时保护：浏览器直连、`/__hills_web_proxy` fallback 和详情页 `loadItem` 都会按设置中的请求超时结束等待，超时后进入现有错误态，避免真实服务器详情接口或代理层异常时页面永久停留在“加载中”。播放流代理保持无该短超时，避免误伤 HLS 分片。
- **2026-06-01**：Web Preview 远端播放链路补齐：浏览器预览新增真实 `get_playback_source` / `play` / `get_state` / 播放进度上报 fallback，通过 `PlaybackInfo` 生成 HLS 播放源、线路候选和媒体源候选；Vite 新增 `__hills_web_stream_proxy` 代理 HLS playlist/segment 并重写 URI，播放器在 Web Preview 中启用 HTML/HLS 内嵌播放。真实账号回归确认新增服务器为追加而非覆盖，首页拉到 5 个媒体库，真实剧集播放到 01:30+ 并出现实际视频帧；验证过程未写入账号、密码、token 或完整线路地址。
- **2026-06-01**：播放器窄屏播放源菜单修复：从设置菜单打开“播放源”时，控制栏弹层不再被隐藏计时器收起；播放源面板打开期间会临时取消自身 `medium` 宽度隐藏规则，避免线路/媒体源条目在窄屏下变成 0×0 不可点击区域。真实账号回归确认两条 443 线路自动识别为 Emby，真实剧集 HTML 视频播放中可切到 Line 2，重新打开菜单显示 Line 2 active，视频继续推进且无错误。
- **2026-06-01**：播放源菜单新增视口约束：920px 以下播放源弹层改为固定定位并保留左右边距，760px 以下控制栏双行时进一步上移，避免真实播放页里弹层边缘跑出视口或被底栏压住；宽屏仍保持原有按钮相对定位。
- **2026-06-01**：Web Preview 路由改为非 `file://` 环境使用 `createWebHistory()`；浏览器预览从首页进入媒体库、详情和播放器时地址栏会同步到真实 `/item/...`、`/player/...` 路径，打包 `file://` 环境继续使用 memory history 保持本地文件启动兼容。
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

- **2026-06-01**：Web Preview 对播放器窗口类命令补齐安全兜底：`set_always_on_top` 返回成功 no-op，`set_secondary_display_blackout` 返回 `{ count: 0 }`，避免浏览器预览点击“置顶”或触发副屏遮黑清理时误报 `Web preview does not implement command`。真实播放页回归确认“置顶”按钮可切到“取消置顶”且无错误浮层；Electron/Tauri 仍走真实窗口后端。
- **2026-05-31**：Electron release 随包 mpv 已完成线路1真实播放冒烟：后端构造 `mpv-direct-static` 播放源后，mpv 实际加载媒体并通过 IPC 返回时长、轨道、H.264 / AAC codec、硬解状态和前进中的播放位置，确认播放源切换基础链路不止停留在 URL 构造层。
- **2026-05-31**：真实播放会话中继续验证了播放器控制面：同一线路1媒体内可通过 mpv IPC 切到字幕轨 `sid = 1` 并关闭字幕，mpv Stats OSD 页面命令可执行，截图命令可生成 PNG 后清理；该媒体没有章节，因此章节跳转仍待有章节样本继续验证。
- **2026-05-31**：章节样本条目 `16240` 已完成真实跳转验证；mpv `chapter-list` 返回 3 章，播放器章节菜单依赖的章节时间和当前章节索引可从 IPC 快照取得，跳到 Story 章节后位置与目标一致。

- **2026-05-31**：真实测试账号联调确认线路1（完整地址已省略）可完成 Electron `PlaybackInfo` 与 `mpvPlaybackSource()` 构造，测试条目 `21648` 选中 `mediasource_21648` 并返回 `mpv-direct-static` / `direct-stream` 摘要；验证过程未把 token、密码或完整播放 URL 写入仓库文档。线路2（完整地址已省略）的 `PlaybackInfo`、普通认证 API 与直连流 Range GET 均被 Cloudflare 返回 HTTP 403，默认 UA 与浏览器 UA 对照一致，因此该线路需要上游 / 反代放行 API 与媒体流后才能继续做真实切线播放验证。

- **2026-05-31**：播放器底栏在存在多个播放线路或 `PlaybackInfo.MediaSources` 候选时显示“播放源”入口；面板按“播放线路 / 媒体源”分组展示候选摘要，切换时按当前播放位置重新发起 mpv 播放并传入 `lineId` / `mediaSourceId`，同时 best-effort 上报旧会话停止进度。设置菜单也提供“播放源”入口，便于窄窗口访问。

- **2026-05-31**：Electron `get_playback_source` 会返回当前播放线路、线路候选和 `PlaybackInfo.MediaSources` 候选摘要；`play` / mpv 播放链支持传入 `lineId` 与 `mediaSourceId` 指定候选重新开流，播放日志与串行去重 key 同步区分切源请求；Tauri `play` / `play_external` 已同步兼容 `lineId` 与 `mediaSourceId`，并让服务器字幕列表跟随当前播放会话线路；Electron 外部播放器入口也会透传线路 / 媒体源选择。

- **2026-05-30**：播放器底部控制栏按 1180px / 920px / 620px 三档收纳低频控件；倍速/截图、队列前后/音轨/章节、快退/快进/音量会随宽度逐级隐藏，核心播放、字幕/弹幕、设置、选集与全屏入口保持可用。
- **2026-05-30**：播放器 Stats 浮层新增五页标签：综合页显示时间/进度/缓存/轨道概况，视频页显示 codec、硬解、尺寸、FPS、码率和丢帧，音频页显示 codec、采样率、声道、码率和速度，轨道页列出全部 mpv 轨道状态，Whisper 页显示当前实时字幕能力状态；播放行为设置可切换为 mpv 自带 OSD。
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
- **2026-05-31**：播放器截图前会临时收起顶部/底部控制层、关闭临时面板并强制同步 embedded mpv rect，避免截图继承控制栏显示时的内嵌避让区域；截图完成或失败后恢复控制层提示计时。
- **2026-06-01**：播放器画面空白区域支持长按临时 2.0x；该手势复用当前播放后端的倍速命令，Web Preview HTML video 与 Electron/Tauri mpv 路径都会在松开后恢复长按前倍速。
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
- **2026-05-31**：设置页新增“画质增强”能力面板，Windows HDR 保持系统入口，其余 RTX VSR、RTX TrueHDR、AMD FSR、RIFE 与 GLSL Shaders 以待接入状态展示，不提供尚无后端支撑的假开关。
- **2026-05-31**：设置页新增“AI 字幕”能力面板，Whisper 本地转写、Whisper API、CUDA / Vulkan、AI 翻译和 DTW 时间戳均以待接入状态展示；播放器 Stats 的 Whisper 页同步改成能力状态，不再显示尚无后端支撑的“0s / 0 段”任务数。
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

- **2026-06-01**：详情页类型标签改为可点击导航，优先通过 `GenreItems.Id` 进入 `/genre/:id`，缺少 id 时按类型名称查询；新增类型作品页支持真实 `list_items` 过滤、排序、分页加载和海报卡片进入详情，不再把类型只当静态装饰。Web Preview 真实会话直接打开 `/genre/name:动画` 返回 722 部作品与 48 张首屏卡片；本轮详情接口在浏览器中停留加载态，详情页标签点击待详情加载恢复后补验。
- **2026-06-01**：详情页主详情加载增加超时兜底；当 `get_item_detail` 在 Web Preview 直连或代理链路中超过当前请求超时时，页面会复用既有加载失败状态展示错误，避免从类型页、人员页或媒体库进入详情后无限停留在加载中。
- **2026-06-01**：详情页媒体信息在存在多个 `MediaSources` 时新增版本摘要卡片，逐项展示容器、分辨率、视频/音频编码、码率、大小、音轨/字幕数量和播放能力；版本卡不展示 Path、完整 URL 或本地路径，疑似路径的 MediaSource 名称会降级为“版本 N”。真实服务器当前样本为单 MediaSource，确认不会额外显示空版本区，媒体信息区未暴露完整 URL 或 Windows 路径。
- **2026-06-01**：详情页 `BoxSet` 合集新增“合集内容”横滑区；页面会通过现有 `list_items(parentId)` 拉取 Movie / Series 子项，复用海报卡片进入详情，且在无子项或请求失败时不展示空壳。真实服务器会话扫描 5 个媒体库首屏未发现可目检的 BoxSet 样本，本阶段以构建验证和非伪造逻辑落地为准。
- **2026-06-01**：详情页演职人员卡片支持点击进入 `/person/:id` 人员作品页；新增人员作品页按 `PersonIds` 或名称筛选真实作品，支持排序、分页加载、空状态/错误状态和海报卡片进入详情。Web Preview 真实服务器回归中，测试条目第一位演职员跳转后返回 `3 部作品` 且无错误。
- **2026-06-01**：详情页 Hero 在 Electron/Tauri 桌面运行时新增下载入口；电影和单集会直接创建下载任务，剧集页优先使用继续观看单集作为下载目标，任务创建后跳转到 `/downloads?task=...` 定位。Web Preview 不显示该入口，避免伪造没有桌面后端的下载能力。
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
- **2026-05-31**：设置页“同步”改为只读能力面板，Trakt OAuth、观看记录同步、评分同步、收藏同步和 Douban 评分均显示待接入状态；旧 Trakt 用户名输入和未闭环同步开关已从 UI 移除，避免误导用户以为已经有真实 OAuth / 同步队列。
- **2026-05-29**：设置页关于面板补齐版本、运行壳、平台、服务器、账号、播放核心和打包产物状态；侧边栏与设置页入口统一显示“关于 Hills Lite”，并继续跳转/展开 `settings?c=about`。
- **2026-05-29**：设置页移除未接入真实配置后端的“语言 Auto”静态行，以及播放器分组中带箭头但不可展开的“交互”静态行；当前仅保留真实可操作的设置入口。
- **2026-05-29**：平台层新增普通 Web/Vite 预览回退；无 Electron bridge、无 Tauri runtime 时，设置、服务器、账号、下载、通知和基础媒体列表返回安全空数据，`update_settings` 使用内存合并，首启引导与设置页浏览器验证不再触发 Tauri IPC 错误。设置关于面板在该环境显示 `Web Preview` / `web`。
- **2026-05-29**：Web/Vite 预览不再挂载 mpv 缺失横幅；mpv 检测 IPC 已随本地路径入口一起移除，普通浏览器视觉验证不再依赖本机 mpv 环境。
- **2026-05-29**：设置页开始读取侧边栏传入的 `?c=` 分类参数，服务器、网络、播放器、快捷键、备份、外观、媒体库和关于分类会自动展开对应面板；侧边栏设置分类新增“备份”入口。
- **2026-05-29**：Electron 设置页“关闭时最小化到托盘”接入真实 `closeToTray` 设置，默认开启；主窗口关闭时会按该设置隐藏到托盘或退出，托盘菜单“退出”仍强制关闭应用。
- **2026-05-29**：Electron 设置页“备份与还原”接入配置导出/导入，备份文件包含设置、服务器、账号、当前账号和全局快捷键；导入默认合并同 id 项并刷新渲染层状态，不覆盖既有下载任务和通知。
- **2026-06-01**：Web Preview 补齐配置备份与还原 fallback：`export_config` 会下载与 Electron 同结构的配置 JSON，`import_config` 会打开 JSON 文件选择器并按 `merge` 合并设置、服务器和账号；设置页“备份与还原”在 Electron/Web Preview 中可用。
- **2026-06-01**：设置页“备份与还原”将导入拆分为“合并导入”和“替换导入”；合并继续走 `merge`，替换走 `replace` 且执行前确认，完成文案会区分合并/替换结果。
- **2026-06-01**：Tauri 补齐配置备份与还原：`export_config` / `import_config` 使用系统文件对话框读写 `hills-lite-config` JSON，导入支持合并/替换并同步全局快捷键运行态；设置页“备份与还原”在 Tauri 运行时解除禁用。
- **2026-05-29**：Electron 桌面集成接入托盘、`rodelplayer://` 协议入口、single instance 深链转发、关闭隐藏到托盘和播放期间 `powerSaveBlocker` 防息屏；`set_now_playing*` / `clear_now_playing` 不再是空操作，托盘 tooltip 会显示播放状态、活动下载数和未读通知数。
- **2026-05-29**：Electron 弹幕源接入 DanDanPlay provider，`list_danmaku_providers` 返回真实列表，`fetch_danmaku` 会读取当前媒体详情、按剧集名匹配 DanDanPlay、拉取评论并转换为播放器弹幕格式；Electron 与 Tauri 侧使用一致的弹幕 User-Agent。
- **2026-05-29**：Electron 下载中心接入基础下载管理器，支持 Emby/Jellyfin 直连下载、Range 断点续写、暂停/继续/取消/移除、本地 mpv 播放和启动后恢复 running 任务；下载任务保存 headers/User-Agent 以便默认无 `api_key` 的鉴权路径可恢复。
- **2026-05-31**：下载中心操作补齐：失败/取消任务可重试，任务卡显示本地文件名，已保存路径可打开所在目录；删除操作拆成“移除记录”和“删除文件和记录”，并为任务操作补齐忙碌状态和错误提示，窄屏下操作按钮自动换行。
- **2026-05-31**：Electron 下载任务完成、失败和取消会写入通知中心并同步 toast/unread 事件；完成通知的 `open-task` 动作携带 `taskId`，通知中心和 Toast 点击后进入 `/downloads?task=<id>`，下载页会滚动并高亮对应任务。
- **2026-06-01**：详情页下载入口复用 Electron/Tauri 已有 `start_download` 链路并默认优先直连保存；入口只在桌面运行时可见，Web Preview 继续保留安全空下载后端，不展示不可点击的伪功能。
- **2026-06-01**：设置页新增“下载”面板，`downloadDirectory` 可指定新下载任务保存目录；Electron/Tauri 下载管理器会优先使用该目录，未配置时继续写入应用默认下载目录，Web Preview 不伪装本地目录选择能力。
- **2026-05-29**：Electron 远程遥控接入 Emby/Jellyfin `Sessions`、Playstate 与 GeneralCommand API，支持在线会话列表、播放暂停/停止/快退快进/进度跳转、音量设置和向远端设备发送消息，并过滤 Hills Lite 自己的会话。
- **2026-05-29**：Electron 通知中心命令接入 JSON 状态，支持列表、未读计数、删除、单条已读、全部已读和清空，并在操作后发出 `notification:*` 事件同步前端通知中心与 toast 队列。
- **2026-05-29**：Electron `list_subtitles` 从空实现改为按当前播放会话读取 Emby/Jellyfin PlaybackInfo，生成服务器字幕列表与可交给 mpv `sub-add` 的字幕 URL；停止播放或上报停止后会清空当前字幕会话，避免字幕面板显示上一条播放的字幕。
- **2026-05-31**：播放器字幕面板新增 ASSRT 在线字幕搜索入口，Electron/Tauri 新增 `search_online_subtitles` 与 `resolve_online_subtitle`；用户自行填写 ASSRT Token，搜索结果解析到具体字幕 URL 后通过现有 `addSubtitle` / mpv `sub-add` 加载。Web Preview 不伪造外部服务请求，搜索返回空结果并对解析加载给出不支持提示。
- **2026-05-31**：播放器字幕面板新增“第二字幕”区，Electron/Tauri 新增 `set_secondary_subtitle_track` 并通过 mpv `secondary-sid` / `secondary-sub-visibility` 叠加第二字幕轨；快照新增 `secondarySubId`，主字幕切到当前第二字幕时会先关闭第二字幕，避免同一轨道重复叠加。Web Preview 保持 no-op fallback，不伪造 mpv 双字幕能力。
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

本轮下载通知任务定位的 `node --check electron\backend\store.mjs`、`node --check electron\backend\downloads.mjs`、`node --check electron\main.mjs`、`npm.cmd run check:electron-commands`、`npm.cmd run build`、行尾空白检查与 `npm.cmd run electron:build` 已通过；in-app Browser 复用 1420 服务点击侧边栏“下载”后进入下载页，空任务状态正常且页面错误数为 0。后续 `2026-05-31-2201-memory-history-deep-links.md` 已补齐 memory history 冷开 path/query 同步，直接以 `/downloads?task=...` 冷开可进入下载页。

本轮 Memory History 深链接冷开已接入：启动时会在非 `file://` 且路径不是 `/` / `index.html` 时，把浏览器 path/query 同步到 memory router；`/settings?c=sync` 可直接展开同步面板，`/downloads?task=demo` 可直接进入下载页空态。验证已覆盖 `npm.cmd run build`、行尾空白检查、in-app Browser 1421 干净 dev server 冷开两条深链接与 `npm.cmd run electron:build`。

本轮画质增强能力面板的 `npm.cmd run build`、行尾空白检查与 `npm.cmd run electron:build` 已通过；in-app Browser 点击设置页“画质增强”后显示 Windows HDR、RTX VSR、RTX TrueHDR、AMD FSR、RIFE、GLSL Shaders 6 个能力项，Web Preview 下 Windows HDR 为禁用，其余增强项为待接入，页面错误数为 0。

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

本轮画质增强能力面板已接入：设置页新增只读能力列表，Windows HDR 保持系统入口，RTX VSR、RTX TrueHDR、AMD FSR、RIFE 和 GLSL Shaders 显示待接入状态，不提供尚无后端支撑的开关。验证已覆盖 `npm.cmd run build`、行尾空白检查、in-app Browser 面板目检与 `npm.cmd run electron:build`。

本轮 AI 字幕能力面板已接入：设置页新增只读能力列表，Whisper 本地转写、Whisper API、CUDA / Vulkan、AI 翻译和 DTW 时间戳显示待接入状态；播放器 Stats 的 Whisper 页改为“待接入 / 未配置 / 待检测”，不再展示尚无运行时支撑的任务队列数。验证已覆盖 `npm.cmd run build`、行尾空白检查、in-app Browser 1421 干净 dev server 面板目检与 `npm.cmd run electron:build`。

本轮首启引导基础的 `node --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过。

本轮 JAV 番号过滤的 `node --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过。

本轮同步设置基础的 `node --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、行尾空白检查、`npm.cmd run build`、`npm.cmd run electron:build` 已通过。

本轮同步能力面板已接入：设置页“同步”显示 Trakt OAuth、观看记录同步、评分同步、收藏同步和 Douban 评分 5 个待接入能力项，不再提供未闭环的 Trakt 用户名输入或同步范围开关。验证已覆盖 `npm.cmd run build`、行尾空白检查、in-app Browser 1421 干净 dev server 面板目检与 `npm.cmd run electron:build`。

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

本轮 ASSRT 在线字幕搜索已接入：Electron/Tauri 均新增 `search_online_subtitles` 与 `resolve_online_subtitle`，按 ASSRT 文档使用 `q`、`cnt`、`pos` 搜索并解析 `lang.desc`、`subtype`、评分与文件列表；播放器字幕面板新增 Token 输入、关键词搜索、结果列表和一键加载。验证已覆盖 `node --check electron\main.mjs`、`npm.cmd run check:electron-commands`、`cargo fmt --manifest-path src-tauri\Cargo.toml --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、`npm.cmd run build`、行尾空白检查与敏感关键字扫描；没有用户 ASSRT Token，未做真实 ASSRT 请求，in-app Browser 本轮拒绝打开 `127.0.0.1:1420`，因此未做浏览器视觉目检。

本轮字幕堆叠已接入：Electron/Tauri 均新增 `set_secondary_subtitle_track`，通过 mpv `secondary-sid` / `secondary-sub-visibility` 选择第二字幕轨，播放器快照新增 `secondarySubId`；字幕面板在有多条字幕时显示“第二字幕”区，可关闭或选择第二字幕，并阻止主字幕与第二字幕选择同一轨道。验证已覆盖 `node --check electron\backend\mpv.mjs`、`node --check electron\main.mjs`、`npm.cmd run check:electron-commands`、`cargo fmt --manifest-path src-tauri\Cargo.toml --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、`npm.cmd run build`、行尾空白检查、本地 Vite HTTP 200 检查与 `npm.cmd run electron:build`；in-app Browser 本轮仍被 Browser URL policy 拒绝打开 `127.0.0.1`，因此未做浏览器视觉目检。

本轮截图避让重置已接入：播放器执行截图前会清理控制栏隐藏计时器、关闭临时面板、临时收起顶部/底部控制层、等待渲染帧并强制同步 embedded mpv rect，减少截图继承控制栏显示状态下内嵌视频避让区域的概率；截图成功或失败后恢复控制层提示计时。验证已覆盖 `npm.cmd run build`、行尾空白检查与 `npm.cmd run electron:build`；未做真实播放器截图文件的人工视觉对比。

本轮下载中心操作补齐已接入：下载任务卡新增失败/取消重试、打开所在目录、移除记录、删除文件和记录入口，并显示本地文件名；任务操作带忙碌态和错误提示，操作区改为可换行按钮组以适配窄屏。验证已覆盖 `npm.cmd run build`、`npm.cmd run check:electron-commands`、行尾空白检查与 `npm.cmd run electron:build`；in-app Browser 尝试打开 `http://localhost:1420/downloads` 时被 Browser URL policy 拒绝，因此未做浏览器视觉目检。

本轮下载通知任务定位已接入：Electron 下载完成、失败、取消会写入通知中心；下载完成通知携带 `taskId`，通知中心和 Toast 点击后进入下载页并定位高亮对应任务。验证已覆盖 `node --check electron\backend\store.mjs`、`node --check electron\backend\downloads.mjs`、`node --check electron\main.mjs`、`npm.cmd run check:electron-commands`、`npm.cmd run build`、行尾空白检查、`npm.cmd run electron:build` 与 in-app Browser 下载页空态目检。

本轮下载失败通知重试动作已接入：Electron/Tauri 下载失败通知都会携带“重试”动作和 `taskId`，通知中心与 Toast 共用动作路由会调用下载 store 恢复任务，并跳转到 `/downloads?task=<id>` 定位对应任务。验证已覆盖 `node --check electron\backend\downloads.mjs`、`cargo fmt --manifest-path src-tauri\Cargo.toml --check`、`npm.cmd run check:electron-commands`、行尾空白检查、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、`npm.cmd run build` 与 `npm.cmd run electron:build`；当前未人工构造真实失败下载任务点击通知。

本轮添加服务器账号入口可见性已修正：账号区移到线路区之前，用户名、密码、端口和自动识别入口在 1280x720 预览首屏同时可见；弹窗内容区补齐 `min-height: 0`，避免底部按钮栏压住输入。验证已覆盖 in-app Browser 目检、`npm.cmd run build` 与本阶段触碰文件行尾空白检查。

本轮内嵌视觉临时脚本已清理：删除上一轮遗留的 `scripts/smoke-electron-embedded-visual.mjs`，并确认仓库内未检出测试账号名或密码明文。后续真实联调只使用临时进程参数或环境变量承载敏感字段。

本轮 Git 同步状态已复核：工作树干净，`main` 本地比 `origin/main` 领先 7 个提交；上轮遗留的 `127.0.0.1:1421` 临时 Vite dev server 已关闭。再次执行 `git push origin main` 仍失败，错误为 `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS`，当前判断是本机 Git 凭据缺失，不是代码冲突或远端拒绝；凭据恢复后可直接推送。

本轮服务器延迟显示与添加弹窗适配已闭环：线路延迟统一经 `formatLatencyMs` 展示，低于 10ms 的正值显示为 `<10ms`，不再暴露 `1ms` 这类假精度；播放源切换菜单同步复用该格式。添加服务器弹窗改为视口约束宽度并允许底部按钮换行，窄宽度下“保存”按钮保持可见可点。验证已覆盖 `npm.cmd run build`、行尾空白检查、in-app Browser 1422 窄视口目检、本地 mock Emby 连续添加两个服务器并测活显示 `<10ms`，以及 `npm.cmd run electron:build`。

本轮本地视频文件播放入口已闭环：侧边栏新增“打开本地文件”，Electron/Tauri 新增 `play_file`，播放器可通过 `/player/local-file?file=...` 直接加载单个本地视频并清空远端会话/队列状态；本地播放标题、桌面媒体状态、截图命名、字幕搜索和错误复制均使用本地文件名。Electron 运行日志仅记录文件名，不写完整本地路径。验证已覆盖 `node --check electron\main.mjs`、`node --check scripts\smoke-electron-local-file.mjs`、`npm.cmd run check:electron-commands`、`cargo fmt --manifest-path src-tauri\Cargo.toml`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、`npm.cmd run build`、Electron 本地文件 smoke、in-app Browser Web Preview 本地文件路由文案目检与 `npm.cmd run electron:build`。

本轮本地文件同名字幕自动关联已闭环：本地视频播放会扫描同目录 `.srt/.ass/.ssa/.vtt`，完全同名优先，语言/版本后缀次之，首条字幕自动选中，其余加入但不抢当前字幕；本地文件入口会关闭 mpv 模糊自动字幕扫描，避免应用侧加载与 mpv 自动扫描产生重复字幕轨。Tauri `play_file` 同步接入该逻辑，远端播放与下载任务本地回放继续保持默认自动字幕策略。验证已覆盖 `node --check electron\backend\mpv.mjs`、`node --check electron\main.mjs`、`node --check scripts\smoke-electron-local-file.mjs`、`cargo fmt --manifest-path src-tauri\Cargo.toml`、`npm.cmd run check:electron-commands`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、`npm.cmd run build`、Electron 本地文件同名字幕 smoke、行尾空白检查与 `npm.cmd run electron:build`。

本轮最近本地文件入口已闭环：新增 `localFiles` Pinia store，使用当前客户端 `localStorage` 保存最近 8 个本地文件路径；侧边栏底部在“打开本地文件”下方展示最近 3 个文件，可直接重开或一键清空。记录仅保存在用户本机浏览器/桌面壳本地状态，不写入仓库、后端或同步服务。验证已覆盖 `npm.cmd run build`、行尾空白检查、in-app Browser 空状态侧边栏目检与 `npm.cmd run electron:build`。

本轮本地同名 XML 弹幕自动关联已闭环：本地文件播放成功后会依次尝试 `同名.xml`、`同名.danmaku.xml`、`同名.comments.xml`，解析到有效 XML 弹幕后自动开启弹幕；手动导入与自动导入共用同一套弹幕结果应用逻辑。切换本地文件时会清空旧弹幕，避免上一部的弹幕残留到下一部。验证已覆盖 `npm.cmd run build`、行尾空白检查与 `npm.cmd run electron:build`。

本轮文件服务能力面板已闭环：设置页新增“文件服务 / 连接器”状态面板，明确本地单文件、最近本地文件、同名字幕和同名 XML 弹幕为可用能力，并将文件夹媒体库、WebDAV、SMB、Alist/OpenList、Plex 连接器保持为待接入；深链接 `/settings?c=file-services` 可直接展开该面板。验证已覆盖 `npm.cmd run build`、行尾空白检查、in-app Browser 目检与 `npm.cmd run electron:build`。

本轮本地文件夹浏览已闭环：新增 `/local-folder` 页面和侧边栏“打开本地文件夹”入口，Electron/Tauri `list_local_folder` 会枚举所选目录第一层的常见视频格式并返回文件名、路径、扩展名、大小和修改时间；列表项点击后复用现有本地文件播放、最近本地文件、同名字幕和同名 XML 弹幕链路。Web Preview 对该命令返回空列表，避免假装拥有本地文件权限。验证已覆盖 `cargo fmt --manifest-path src-tauri/Cargo.toml`、`node --check electron/main.mjs`、`npm.cmd run build`、`cargo check --manifest-path src-tauri/Cargo.toml --all-targets`、行尾空白检查、in-app Browser 目检与 `npm.cmd run electron:build`。

本轮本地文件夹播放队列已闭环：`player` store 队列增加 `remote` / `local` 类型，本地文件夹列表点击视频时会把当前列表写入本地队列；播放器选集菜单显示文件名，上一集/下一集切换会继续调用本地 `play_file`，切换后重新尝试同名 XML 弹幕并更新播放器 URL；从本地文件夹进入播放器时返回按钮会回到来源文件夹。验证已覆盖 `npm.cmd run build`（首次 Vite HTML 输出路径异常，重跑通过）、行尾空白检查、in-app Browser 目检与 `npm.cmd run electron:build`。

本轮最近本地文件夹已闭环：`localFiles` store 使用独立 `hills-lite:recent-local-folders` 本地 key 保存最近 8 个文件夹；侧边栏底部展示最近 2 个文件夹并可清空，`/local-folder` 未选择目录时展示最近 6 个文件夹快捷入口。记录仅保存在当前客户端，不写入仓库、后端或同步服务。验证已覆盖 `npm.cmd run build`、行尾空白检查、in-app Browser 空状态目检与 `npm.cmd run electron:build`。

本轮本地文件夹递归扫描已闭环：Electron/Tauri `list_local_folder` 支持 `recursive` 参数，递归扫描子目录时返回每个视频的 `relativePath`，并以 500 个视频为上限返回 `truncated` 标记；`/local-folder` 页面新增“包含子文件夹”开关，递归模式下显示相对路径和截断提示，播放队列继续由当前扫描结果生成。Web Preview 仍返回空列表与递归状态，避免假装拥有本地文件权限。验证已覆盖 `cargo fmt --manifest-path src-tauri\Cargo.toml`、`node --check electron\main.mjs`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、`npm.cmd run build`、行尾空白检查、in-app Browser 目检与 `npm.cmd run electron:build`。

本轮本地文件夹搜索筛选已闭环：`/local-folder` 页面新增搜索框，按文件名、相对路径和扩展名过滤当前扫描结果，计数显示筛选数 / 总数，点击视频时本地播放队列使用筛选后的列表；设置页“文件夹媒体库”说明同步更新为支持一层或子目录视频文件。验证已覆盖 `npm.cmd run build`、行尾空白检查、in-app Browser 搜索框和窄宽布局目检与 `npm.cmd run electron:build`；Browser 自动文本输入受虚拟剪贴板限制，未作为通过项记录。

本轮收藏本地文件夹已闭环：`localFiles` store 使用独立 `hills-lite:favorite-local-folders` 本地 key 保存最多 32 个收藏文件夹；`/local-folder` 当前目录支持星标收藏/取消收藏，空状态展示收藏文件夹快捷入口，侧边栏底部展示收藏本地文件夹并可清空；最近文件夹列表会避开已收藏目录，减少重复入口。设置页“文件服务 / 连接器”面板同步将“收藏本地文件夹”标记为可用。验证已覆盖 `npm.cmd run build`、行尾空白检查、in-app Browser 星标点击与侧边栏收藏分组目检、`npm.cmd run electron:build`。

本轮本地文件夹排序已闭环：`/local-folder` 工具栏新增排序下拉，支持路径、文件名、最近修改和大小；列表展示和点击播放时写入的本地队列都使用搜索与排序后的可见结果。验证已覆盖 `npm.cmd run build`、行尾空白检查、in-app Browser 排序下拉目检与切换、`npm.cmd run electron:build`。

本轮收藏本地文件已闭环：`localFiles` store 使用独立 `hills-lite:favorite-local-files` 本地 key 保存最多 32 个收藏文件；`/local-folder` 文件行支持星标收藏/取消收藏，侧边栏底部展示收藏本地文件并可清空，最近本地文件列表会避开已收藏项。设置页“文件服务 / 连接器”面板同步将“收藏本地文件”标记为可用。验证已覆盖 `npm.cmd run build`、in-app Browser 设置页与本地文件夹页面目检、`npm.cmd run electron:build`、行尾空白检查与敏感关键字扫描。

本轮本地文件夹同名封面已闭环：Electron/Tauri `list_local_folder` 会为视频返回同名图片或目录级 `poster/cover/folder` 图片；Electron 使用 `hills-image://local/...` 安全读取本地图片，`/local-folder` 文件行显示缩略图并在失败时回退视频图标。设置页“文件服务 / 连接器”面板同步将“同名封面”标记为可用。验证已覆盖 `node --check electron\main.mjs`、`cargo fmt --manifest-path src-tauri\Cargo.toml`、`npm.cmd run build`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、in-app Browser 设置页与本地文件夹页面目检、`npm.cmd run electron:build`。

本轮 Web Preview 配置备份已闭环：Web Preview `export_config` 会下载与 Electron 同结构的配置 JSON，`import_config` 会打开 JSON 文件选择器并按 `merge` 合并设置、服务器和账号；设置页“备份与还原”在 Electron/Web Preview 中可用。本轮同时用测试账号做真实服务器回归：临时新增两条 443 线路后自动识别为 Emby，新增服务器为追加而非覆盖，首页拉到 5 个媒体库；临时测试服务器已删除，验证过程未写入密码、token 或完整线路地址。验证已覆盖 `npm.cmd run build`、in-app Browser `/settings?c=backup` 冷刷新目检、行尾空白检查与敏感关键字扫描。

本轮配置导入模式已闭环：设置页“备份与还原”将导入拆成“合并导入”和“替换导入”，合并继续走 `merge`，替换走 `replace` 且执行前确认；导入完成文案会区分合并/替换结果。验证已覆盖 `npm.cmd run build`、in-app Browser `/settings?c=backup` 冷刷新目检、行尾空白检查与敏感关键字扫描。

本轮 Tauri 配置备份已闭环：Tauri 新增 `export_config` / `import_config`，通过系统保存/打开对话框读写与 Electron/Web Preview 同结构的 `hills-lite-config` JSON；导入支持 `merge` / `replace`，会更新设置、服务器、账号、当前账号，并同步全局快捷键 store 与运行态注册。设置页“备份与还原”在 Tauri 运行时解除禁用，Web Preview 与 Electron 行为保持不变。验证已覆盖 `cargo fmt --manifest-path src-tauri\Cargo.toml`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、`npm.cmd run build`、in-app Browser `/settings?c=backup` 冷刷新目检、`git diff --check`、敏感关键字扫描与 `npm.cmd run electron:build`。

本轮 Web Preview 内嵌播放已闭环：Web Preview 平台 fallback 补齐真实 PlaybackInfo 播放源、HLS 流代理、HTML 视频播放、播放进度上报和基础播放器状态命令；播放器在 Web Preview 中启用内嵌 HTML/HLS 视频，线路/媒体源菜单可复用同一套切源逻辑，浏览器自动播放限制会回落为等待用户点击播放而非错误浮层。验证已覆盖 `npm.cmd run build`、`npm.cmd run electron:build`、`git diff --check`、in-app Browser 1422 预览真实账号登录、5 个媒体库加载、真实剧集播放到 01:30+ 且出现实际视频帧；敏感值扫描确认未写入测试账号、密码或完整线路地址。

本轮播放器窄屏播放源菜单已闭环：真实账号回归复现了“设置 → 播放源”在窄屏下条目存在但被响应式隐藏为 0×0 的问题；`PlayerView` 现在会在弹层打开期间保持控制栏可见，并在播放源面板打开时临时取消播放源按钮的 `medium` 隐藏规则。验证已覆盖 `npm.cmd run build`、`npm.cmd run electron:build`、`git diff --check`、in-app Browser 1421 真实账号登录、两条 443 线路自动识别为 Emby、首页 5 个媒体库加载、真实剧集 1920×1080 HTML 视频播放、窄屏 Line 2 切换后 active 状态与持续播放；敏感值扫描确认未写入测试账号、密码、token 或完整线路地址。

本轮播放源菜单视口约束已闭环：`PlayerView` 在 920px 以下将播放源弹层固定到播放器视口并保留左右边距，760px 以下避开双行控制栏；真实播放页目检确认 Line 2 和媒体源选中状态可见，菜单主体不被底栏遮挡。验证已覆盖 `npm.cmd run build`、`npm.cmd run electron:build`、`git diff --check`、in-app Browser 真实播放页菜单目检与敏感关键字扫描。

本轮 Web Preview 路由地址同步已闭环：`src/router/index.ts` 现在按运行协议选择 history，非 `file://` 环境使用 `createWebHistory()`，打包本地文件继续使用 `createMemoryHistory()`。验证已覆盖 `npm.cmd run build`、`npm.cmd run electron:build`、`git diff --check`、in-app Browser 冷开 `/home` 后进入真实详情得到 `/item/16114`，点击继续播放后得到 `/player/16890?start=...&from=...`，播放器路由内 HTML 视频对象保留 1920×1080 媒体宽高；敏感关键字扫描确认未写入测试账号、密码、token 或完整线路地址。

本轮线路测活自动切线三端对齐已闭环：Electron `test_lines` 与 Web Preview fallback 现在和 Tauri 一样，在 `autoFailover` 未关闭时会从启用且非 down 的线路中按优先级与延迟选择 active line；测活不再只更新健康状态而不影响后续播放线路。验证已覆盖 `node --check electron\main.mjs`、`npm.cmd run build`、in-app Browser Web Preview 真实测试账号临时添加两条 443 线路、自动识别 Emby、登录成功、真实线路测活返回秒级延迟、首页加载 5 个媒体库、详情页继续播放并创建 1920×1080 HTML 视频对象；验证过程未写入账号、密码、token 或完整线路地址。

本轮设置页当前线路控制已闭环：服务器线路列表会在 active line 上显示“当前”，其他启用线路提供“设为当前”按钮并复用现有 `set_active_line` 命令；该入口修改服务器级默认线路，播放器会话级切源仍走播放器内播放源面板。验证已覆盖 `npm.cmd run build`、in-app Browser 使用真实测试账号当前会话打开 `/settings?c=servers`，确认“当前”标记可见，点击“设为当前”后标记移动到目标线路。

本轮播放器播放按钮可识别性已闭环：真实测试账号临时会话在 1420 Web Preview 中确认服务器已连接、媒体库加载、电影列表与详情页可打开，进入播放器后拿到真实 1440×1080 HTML 视频对象；同时修复中央播放/暂停按钮没有可访问名称的问题，现在按钮会随状态暴露“播放”或“暂停”的 `title` / `aria-label`，便于用户悬停、辅助技术识别和自动化回归定位。验证已覆盖 `npm.cmd run build`、播放器页冷刷新按钮名称检查、`git diff --check`、敏感关键字扫描与 `npm.cmd run electron:build`；验证过程未写入账号、密码、token 或完整线路地址。

本轮真实双线路默认播放回归已闭环：1420 Web Preview 使用真实测试账号当前会话，将当前真实服务器编辑为两条 443 线路，保存后“测活”返回两条真实秒级延迟；设置页“设为当前”切到第二线路后，新开播放器默认播放源菜单选中第二线路，并可在会话内切到主线路再切回第二线路，期间 HTML 视频对象保持 1440×1080 / readyState 4。该阶段仅更新验证日志和状态快照，未改运行时代码，未写入账号、密码、token 或完整线路地址。

本轮播放源切换当前复核已闭环：当前工作树再次确认 Electron `get_playback_source` / `play`、Tauri `play` / `play_external`、播放器 store、播放源菜单和外部播放器入口均保留 `lineId` / `mediaSourceId` 透传；`node --check electron\backend\emby.mjs`、`node --check electron\main.mjs`、`npm.cmd run check:electron-commands`、`npm.cmd run build`、`cargo fmt --manifest-path src-tauri\Cargo.toml --check`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets` 与 `npm.cmd run electron:build` 均通过。in-app Browser 1420 真实会话确认服务器 `001` 已连接、主线路为当前线路且线路 2 可用，播放源菜单显示主线路、线路 2 与媒体源摘要；用户手势播放后 HTML 视频推进并保持 `readyState = 4` / 1440×1080，切到线路 2 后继续推进到约 45 秒且无播放错误。验证过程未写入账号、密码、token 或完整线路地址。

本轮 Electron 退出清理已闭环：主窗口关闭不再默认隐藏到托盘，而是进入统一清理流程，退出时会清理 mpv、`electron_mpv_host.exe`、遮黑窗口、全局快捷键、桌面媒体状态和防休眠状态；mpv 与宿主进程增加 Windows `taskkill /T /F` 兜底。Electron 默认菜单栏已隐藏并移除默认应用菜单；播放器全屏按钮在桌面运行时优先调用原生窗口全屏，Web Preview 保持浏览器 Fullscreen 回退。验证已覆盖 `node --check electron\main.mjs`、`node --check electron\backend\mpv.mjs`、`node --check electron\backend\desktop.mjs`、`npm.cmd run check:electron-commands`、`npm.cmd run build`、`npm.cmd run electron:build`、`git diff --check`；构建前已清除当时残留进程，构建后复查未发现 Hills Lite / mpv / 内嵌宿主残留。

本轮侧边栏主界面瘦身已闭环：侧边栏底部只保留“设置”入口，移除添加服务器、本地单文件、本地文件夹、WebDAV、Alist/OpenList 以及最近/收藏快捷分组，避免主界面堆叠维护类入口；这些功能统一迁移到设置页“服务器”和“文件服务 / 连接器”面板，其中文件服务面板提供本地文件、本地文件夹、WebDAV、Alist/OpenList 入口。验证已覆盖 `npm.cmd run build`、`npm.cmd run check:electron-commands`、`git diff --check`。

本轮禁止服务端转码已闭环：Electron 与 Web Preview 的 PlaybackInfo 请求显式启用 Direct Play / Direct Stream、禁用 Transcoding，并移除 HLS 转码 profile；播放源选择不再优先 `TranscodingUrl`，只接受 Direct Play / Direct Stream 媒体源，最终播放 URL 固定走 `Videos/{id}/stream?Static=true`，HTML fallback 也不再生成 `master.m3u8` 转码地址。Tauri 播放、外部播放、远程会话播放和下载路径同样只选择支持本机解码的媒体源，服务端只返回转码源时会直接失败而不是偷偷压 NAS/VPS CPU。播放进度上报默认 `DirectStream`，避免把会话标记为转码。验证已覆盖 `node --check electron\backend\emby.mjs`、`cargo fmt --manifest-path src-tauri\Cargo.toml --check`、`npm.cmd run build`、`npm.cmd run check:electron-commands`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、`npm.cmd run electron:build`、`git diff --check`、转码关键字残留扫描与构建后残留进程检查。

本轮首页巨幕真实媒体条目已闭环：`library` store 新增 `heroItems`，首页刷新时会从当前账号媒体库拉取真实电影 / 剧集 / 单集条目及 Overview、年份、播放状态等字段；`HeroCarousel` 不再把媒体库视图卡片混入巨幕候选池，而是使用 `heroItems` 并以继续观看作为兜底。巨幕背景优先使用 Backdrop，缺失时回退 Primary；右侧新增真实海报图，巨幕模式高度和标题布局同步放大，减少“巨幕太小、下方空”的观感。未登录空状态文案同步改为从设置页添加服务器。验证已覆盖 `npm.cmd run build`、`npm.cmd run electron:build`、`git diff --check`、代码路径检查与构建后残留进程检查；本轮 in-app Browser 通道不可用，未完成截图目检。

本轮收藏、历史与聚合视界加载修正已闭环：新增 `src/utils/personalMedia.ts` 统一封装个人媒体集合查询，收藏页现在按电影 / 剧集 / 单集拉取并保留错误重试；历史页会合并 `IsPlayed` 与 `Items/Resume`，未看完但有播放进度的电影/单集不再从历史里消失，分页加载会继续按已播放记录推进并去重；聚合视界复用同一套收藏和个人历史加载逻辑，避免概览与独立页面口径不一致。验证已覆盖 `npm.cmd run build`、`npm.cmd run electron:build`、`git diff --check`、Electron 命令覆盖与 package 完整性检查；本轮 in-app Browser 仍无可用 route，未做浏览器目检。

本轮播放器后退与返回控制修正已闭环：`PlayerView` 新增统一 `seekToMs`，拖动进度条、章节跳转、自动跳过片头和后退/前进按钮都走同一套 seek 逻辑；Web Preview / HTML video 路径会直接 seek 真实 `<video>` 并同步播放位置，桌面路径继续走 mpv 原生 seek。播放器返回按钮会先关闭弹层、退出原生或浏览器全屏，再按来源回到本地文件夹、WebDAV、Alist 或媒体详情页。内嵌播放 smoke 已扩展后退按钮断言并支持桌面原生全屏检测：本轮 smoke 中“后退 10 秒”从约 10.6 秒退到约 1.4 秒，原生全屏进入/退出、960×620 resize 和彩色视频像素检测均通过。验证已覆盖 `node --check scripts\smoke-electron-embedded-local.mjs`、`npm.cmd run build`、`node scripts\smoke-electron-embedded-local.mjs`、`npm.cmd run electron:build`、`git diff --check` 与构建后残留进程检查。

本轮添加服务器自动识别简化已闭环：添加服务器首屏重新收敛为“账号 + 线路”流程，不再要求手填服务器名称，不再显示类型分段选择，保存前统一通过 `/System/Info/Public` 自动识别 Emby / Jellyfin 和服务端名称；无法识别时不会创建伪服务器。线路地址支持直接写入 `:443`、`:8096` 或任意自定义端口，也可使用独立端口框覆盖；添加弹窗移除全局默认 UA，只保留单条线路高级设置中的 UA / Headers。线路 UI 改为分隔行而不是卡片套卡片。验证已覆盖 `npm.cmd run build`、`npm.cmd run electron:build`、`git diff --check`；本轮 Codex in-app Browser route 不可用，未做浏览器目检。

本轮播放器全屏与小窗口自适应已闭环：播放器根容器补齐 `100dvh` 高度兜底，顶部与底部控制层改用统一边距变量和安全区底边；低高度窗口会收紧控制栏、隐藏低优先级按钮和副标题，弹层最大高度同步收窄，避免全屏或最小桌面窗口下控制栏挤压画面。`smoke-electron-embedded-local` 新增 960×600 实际最小窗口断言，确认顶部/底部控制层、播放按钮、全屏按钮可见、无水平溢出、底栏高度控制在 86px。Windows 屏幕截图在当前自动化环境仍可能取到黑帧，smoke 会同时输出屏幕截图像素与 mpv 自截图像素；本轮 mpv 自截图彩色视频通过，屏幕截图 fallback 记录为黑帧。验证已覆盖 `node --check scripts\smoke-electron-embedded-local.mjs`、`npm.cmd run build`、`node scripts\smoke-electron-embedded-local.mjs`、`npm.cmd run electron:build`、`git diff --check`。

本轮设置页线路 URL 脱敏预览已闭环：服务器列表普通查看态不再直接显示完整远端线路 URL，而是展示保留协议、端口和部分主机名的脱敏预览；`localhost` / IP 线路保持原样便于本地调试，完整 URL 仍只能在“编辑”表单中查看和修改。验证已覆盖 `npm.cmd run build`、in-app Browser 1420 设置页目检、`git diff --check`、敏感关键字扫描与 `npm.cmd run electron:build`。

本轮 Electron 播放日志脱敏加固已闭环：`playback.log` 写入前的敏感字段处理现在会脱敏远端 URL 主机名、清理 query token，并识别 `Authorization` / token / api-key 类 header tuple，避免 header 数组里的裸 token 写入日志；`localhost` / IP 本地调试地址仍保留。验证已覆盖 `node --check electron\main.mjs`、`npm.cmd run check:electron-commands`、`npm.cmd run build`、`git diff --check`、敏感关键字扫描与 `npm.cmd run electron:build`。

本轮详情页桌面下载入口已闭环：`DetailView` 接入下载 store，在 Electron/Tauri 桌面运行时为电影、单集和剧集继续观看目标提供 Hero 下载按钮，创建任务后进入 `/downloads?task=...`；Web Preview 不显示该入口，避免没有桌面后端时出现假按钮。验证已覆盖 `npm.cmd run build`、in-app Browser 1420 真实测试账号会话打开真实详情页并确认 Web Preview 无桌面下载按钮、`npm.cmd run check:electron-commands`、`git diff --check`、敏感关键字扫描与 `npm.cmd run electron:build`。

本轮下载保存目录设置已闭环：设置模型新增 `downloadDirectory`，设置页“下载”面板可填写或在桌面运行时选择保存目录；Electron/Tauri 下载管理器创建新任务时会优先使用该目录，相对目录解析到应用 userData 下，未配置时继续使用默认下载目录。验证已覆盖 `node --check electron\backend\downloads.mjs`、`node --check electron\backend\store.mjs`、`cargo fmt --manifest-path src-tauri\Cargo.toml --check`、`npm.cmd run build`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、in-app Browser 1420 下载设置面板目检、Electron 目录解析 smoke、`npm.cmd run check:electron-commands`、`git diff --check`、敏感关键字扫描与 `npm.cmd run electron:build`。

本轮真实服务器播放回归已闭环：in-app Browser 1420 使用真实测试账号会话打开首页，媒体库卡片加载正常；进入真实电影媒体库和真实条目详情页后点击“播放”，播放器创建真实 HTML 视频对象，`readyState = 4`，视频尺寸为 1440×1080，页面无播放失败提示。验证过程未写入账号、密码、token 或完整线路地址。

本轮打开下载目录入口已闭环：设置页“下载”面板新增“打开”按钮，Electron/Tauri 桌面运行时会确保当前下载目录存在后调用系统文件管理器打开，并在面板内显示结果或错误；Web Preview 继续禁用桌面目录选择/打开/清除能力，避免假按钮。验证已覆盖 `node --check electron\main.mjs`、`cargo fmt --manifest-path src-tauri\Cargo.toml --check`、`npm.cmd run check:electron-commands`、`npm.cmd run build`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、in-app Browser 1420 下载设置面板目检、`git diff --check`、敏感关键字扫描与 `npm.cmd run electron:build`。

本轮真实服务器连接回归已闭环：in-app Browser 1420 当前会话直接使用真实测试账号，设置页仅保留真实服务器 `001`，两条 443 线路测活返回有效延迟并显示为 Emby 已连接；首页媒体库、真实电影媒体库列表、真实条目详情和播放入口均加载成功，播放器创建真实 HTML video 对象，`readyState = 4`，视频尺寸为 1440×1080，页面无播放失败提示。上轮遗留的两个本地 mock 服务器条目已从当前浏览器状态删除，避免后续测试混淆；自动化点击播放按钮未让 HTML video 时间推进，下一阶段继续单独追播放器启动/用户手势链路。验证过程未写入账号、密码、token 或完整线路地址。

本轮 Web Preview 播放手势兜底已闭环：HTML/HLS 播放按钮在 `video.play()` 被浏览器拒绝为缺少用户手势时，会自动切到静音并重试，避免真实视频对象已加载但时间停在 0 秒；真实测试账号会话直接打开真实播放器页后，点击播放按钮将 HTML video 从 `currentTime = 0` 推进到约 10 秒，`paused = false`，视频尺寸保持 1440×1080 且页面无播放失败提示。验证已覆盖 `npm.cmd run build`、in-app Browser 1420 真实播放页回归、`git diff --check`、敏感关键字扫描与 `npm.cmd run electron:build`；Electron/Tauri 内嵌 mpv 路径不受该 Web Preview fallback 影响。

本轮详情页媒体信息已闭环：Emby/Jellyfin 详情请求三端同步补齐 `MediaSources`，PDP 新增“媒体信息”摘要区，真实条目详情页显示媒体源、MKV 容器、H264 1440×1080、AAC 音频、字幕数量、总码率、大小和本机直连/直流能力；页面文本检查确认未显示完整 URL、Windows 路径或常见 Unix 媒体路径。验证已覆盖 `node --check electron\backend\emby.mjs`、`cargo fmt --manifest-path src-tauri\Cargo.toml`、`npm.cmd run build`、`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`、in-app Browser 1420 真实详情页目检、`git diff --check`、敏感关键字扫描与 `npm.cmd run electron:build`。

本轮 Web Preview 详情加载超时已闭环：`src/platform` 的浏览器直连请求与 `__hills_web_proxy` fallback 统一使用设置里的请求超时，Vite 本地代理会按前端传入的 `timeoutMs` 取消真实 API 请求，`DetailView` 主详情加载超过超时后进入既有错误态；HLS/播放流代理保持不加短超时，避免影响播放分片。验证已覆盖 `npm.cmd run build`、`git diff --check` 与敏感关键字扫描；未写入测试账号、密码、token 或完整线路地址。

本轮 Electron 内嵌播放复核已闭环：`node scripts\smoke-electron-embedded-local.mjs` 启动 Electron 桌面窗口、本地假 Emby 和临时彩色视频，播放器进入 `/player/local-embedded-smoke`，mpv 快照返回 `durationMs = 12000`、`positionMs ≈ 7300`、`trackCount = 2`、`paused = false`，屏幕截图与 mpv 截图的彩色像素检测均通过，确认当前桌面内嵌路径非黑屏。验证过程未写入测试账号、密码、token 或完整线路地址。

本轮播放器长按倍速已闭环：`PlayerView` 在画面空白区域长按时临时切到 2.0x，松开后恢复原倍速，控件/进度条/菜单区域不会触发；Electron 内嵌 smoke 已扩展为模拟长按，验证 `speed` 从 1.0 到 2.0 再恢复到 1.0，且 `2.0x` 徽标随按住/松开显示与消失。验证已覆盖 `npm.cmd run build`、`node --check scripts\smoke-electron-embedded-local.mjs`、`node scripts\smoke-electron-embedded-local.mjs`、`git diff --check` 与敏感关键字扫描；未写入测试账号、密码、token 或完整线路地址。

本轮 WebDAV 基础连接器已闭环：`/webdav` 新增连接配置和目录浏览页，侧边栏新增 WebDAV 入口；Electron 后端新增 `WebDavClient`，通过真实 PROPFIND 解析目录并识别常见视频扩展名，点击视频会携带 Basic Auth header 交给内嵌 mpv 播放；Web Preview 通过本地代理验证目录读取，设置页“文件服务 / 连接器”已将 WebDAV 标记为可用。验证已覆盖 `node --check electron\backend\webdav.mjs`、`node --check electron\main.mjs`、`node --check scripts\smoke-webdav-connector.mjs`、`node scripts\smoke-webdav-connector.mjs`、`npm.cmd run check:electron-commands`、`npm.cmd run build`、`git diff --check` 与敏感关键字扫描；未写入测试账号、密码、token 或完整真实线路地址。

本轮 WebDAV 播放队列已闭环：播放器队列模型新增 `direct` 类型，`/webdav` 点击视频时会把当前目录内可播放视频写入 WebDAV direct queue；播放器上一条/下一条、选集菜单、标题副标题与返回按钮均能识别 WebDAV 直链播放，不再把远程 WebDAV 文件误当成本地文件或普通 Emby 条目。`scripts\smoke-webdav-connector.mjs` 的 mock WebDAV 数据扩展为 2 个可播放视频，用于覆盖基础队列候选来源。验证已覆盖 `node --check scripts\smoke-webdav-connector.mjs`、`node scripts\smoke-webdav-connector.mjs`、`npm.cmd run build`、`git diff --check` 与敏感关键字扫描；未写入测试账号、密码、token 或完整真实线路地址。

本轮 WebDAV 收藏入口已闭环：WebDAV 连接记录新增本地星标状态，`/webdav` 当前连接可收藏/取消收藏，空状态会展示收藏与最近 WebDAV 快捷入口；侧边栏 WebDAV 入口下方会显示收藏连接和最近连接，可直接回到对应连接配置。收藏状态只是在已有本地连接记录上保存星标时间，不额外复制密码、token 或完整真实线路到文档/代码。

本轮 WebDAV 列表搜索排序已闭环：`/webdav` 目录加载后新增搜索框和排序下拉，可按名称、路径、扩展名或内容类型筛选当前 PROPFIND 返回条目，并按名称、最近修改、大小或类型排序；播放器 direct queue 会跟随筛选/排序后的可见可播放列表，避免搜索后播放仍跳到未筛选目录顺序。

本轮 WebDAV 同名字幕已闭环：WebDAV PROPFIND 目录解析会识别同层 `.srt/.ass/.ssa/.vtt` 字幕，按完全同名和语言/版本后缀匹配可播放视频；`/webdav` 列表显示字幕数量并支持搜索“字幕”，Electron 内嵌 mpv 播放 WebDAV 视频时会用同一连接认证头加载匹配到的远程字幕。Web Preview 当前只展示侧挂提示，实际字幕加载仍以桌面内嵌 mpv 为准。

本轮 WebDAV 同名 XML 弹幕已闭环：WebDAV 目录解析会把同层 `同名.xml`、`同名.danmaku.xml` 或 `同名.comments.xml` 关联到可播放视频；`/webdav` 列表显示“XML 弹幕”并支持搜索“弹幕 xml”，播放器进入 WebDAV direct 播放后会尝试用同一连接凭据读取远程 XML 并复用现有弹幕解析/合并逻辑。Web Preview 当前仍只返回空弹幕结果，桌面 Electron 为实际加载路径。

本轮 WebDAV 路径面包屑已闭环：`/webdav` 在多级目录中会根据当前 `path` 生成可点击面包屑，支持从深层目录直接回到任意上级目录或根 WebDAV；切换路径继续复用已有路由与目录加载逻辑，不改变认证和播放路径。

本轮 Git 远端同步核查已闭环：本地 `main` 当前无未提交变更，`origin` 默认分支为 `main`，且 GitHub 服务端 `refs/heads/main` 指向 `e8e26507c536d1ad1e7d0019265e2b8c48e91d66`。本轮只更新核查日志与状态快照，不改运行时代码；若网页仍显示旧时间，优先检查页面缓存、登录态或当前查看的仓库/分支入口。

本轮 WebDAV 当前路径操作已闭环：`/webdav` 顶部工具栏在深层路径时提供“回到根目录”入口，目录加载成功后提供“复制当前路径”入口并复用现有剪贴板工具；复制状态会短暂反馈在按钮可访问名称上，切换目录或卸载页面时清理状态计时器。该阶段不在文档中记录真实远端 URL。

本轮 Alist / OpenList 连接器内核已闭环：Electron 后端新增真实 `/api/fs/list` 目录读取、`/api/fs/get` 文件 raw_url 解析和 `/d/...` 签名直链生成；Web Preview fallback 接入同一组 API；本地 smoke 覆盖 token header、目录排序、视频识别、签名下载 URL 与 raw_url 解析。该阶段尚未接 UI 页面入口，设置页能力仍应保持“待接入”，下一阶段继续做可用页面。

本轮 Alist / OpenList 页面接入已闭环：新增 `/alist` 页面和侧边栏入口，支持站点 URL、API Token、路径密码、可选保存凭据、最近连接、目录浏览、面包屑、上一级/回根、复制当前路径、搜索/排序和可播放视频直链播放；播放器 direct queue 会区分 WebDAV 与 Alist 来源，上一条/下一条、选集点击和返回来源页都能回到对应连接器。设置页“文件服务 / 连接器”已将 Alist / OpenList 标记为可用。

本轮 Alist / OpenList 收藏入口已闭环：Alist 连接记录新增本地星标状态，`/alist` 当前连接可收藏/取消收藏，空状态会展示收藏与最近 Alist 快捷入口；侧边栏新增收藏 Alist 分组，最近 Alist 会避开已收藏连接。收藏状态只保存星标时间，不额外扩散 API Token、路径密码或真实站点地址到文档/代码。

本轮 Alist / OpenList 同名侧挂资源已闭环：Alist 目录解析会识别同层 `.srt/.ass/.ssa/.vtt` 字幕和 `同名.xml` / `同名.danmaku.xml` / `同名.comments.xml` 弹幕，`/alist` 列表会显示“字幕 N”和“XML 弹幕”提示并支持搜索字幕/弹幕关键字；播放器 direct queue 会携带这些侧挂资源，Electron 内嵌 mpv 播放 Alist 视频时会尝试加载匹配到的远程字幕，XML 弹幕继续复用播放器现有远程 XML 导入链路。

本轮 Alist / OpenList 播放前刷新直链已闭环：`/alist` 写入 direct queue 时会保留站点 URL、文件路径、路径密码和 token 元数据；播放器每次播放 Alist 队列项前都会重新调用 `/api/fs/get`，优先使用最新 `raw_url`，否则使用最新签名 `/d/...` URL，并同步当前队列 URL，避免下一条/上一条沿用过期签名。播放器侧挂弹幕读取也会按当前 `queueIndex` 找回 Alist 条目，并在远程 XML 导入时携带 token header，私有 Alist/OpenList 站点的同名 XML 弹幕不再只依赖公开直链。

本轮 Alist / OpenList 侧挂资源刷新已闭环：Alist 同名字幕和 XML 弹幕关联结果会保留文件路径，播放器播放 Alist 队列项前会在刷新主视频直链的同时 best-effort 刷新侧挂字幕和 XML 弹幕 URL；侧挂刷新失败时保留目录列表里的原 URL，不阻断主视频播放。这样私有站点或短期签名站点切换上一条/下一条时，不再只刷新视频而让字幕/弹幕沿用旧签名。

本轮 Web Preview 直链队列切换已闭环：播放器把 Web Preview 下的直链 HTML video 播放抽成统一入口，`/player/webdav-file`、`/player/alist-file` 初始播放和 direct queue 上一条/下一条/选集切换都会在 store 更新当前直链后重新绑定 HTML `<video>` 的 `src`。桌面 Electron/Tauri 仍以运行时内嵌 mpv 为准；Web Preview 仅用于无需额外鉴权 header 的直链预览。

本轮文件连接器上次目录已闭环：WebDAV 与 Alist/OpenList 连接记录会在本地保存最近成功浏览的目录路径，页面内选择连接、默认打开最近连接，以及侧边栏收藏/最近入口都会优先回到上次目录；旧连接记录没有该字段时继续回根目录。该状态只保存在当前客户端 localStorage，不写入文档中的真实远端路径。

本轮文件连接器路径标签已闭环：WebDAV 与 Alist/OpenList 的侧边栏收藏/最近入口、页面左侧连接胶囊和空状态快捷入口会在有上次目录时显示 `/path` 第二行，并在 tooltip 中合并连接 URL 与路径；用户点击前可以知道会回到哪个目录。

本轮文件服务面板摘要已闭环：设置页“文件服务 / 连接器”摘要从“本地 / WebDAV 可用”更新为“本地 / WebDAV / Alist 可用”，Alist/OpenList 能力说明同步包含收藏站点、恢复上次目录、刷新签名直链和同名字幕/XML 弹幕播放，避免能力面板落后于实际连接器进度。

本轮远程文件源封面已闭环：WebDAV 与 Alist/OpenList 目录解析会识别同层同名 `.jpg/.jpeg/.png/.webp/.avif/.bmp` 图片，并以 `poster`、`cover`、`folder` 图片作为目录级兜底；Alist/OpenList 还会优先复用接口返回的 `thumb`。`/webdav` 与 `/alist` 视频行会显示缩略图，加载失败时回退文件图标，设置页“同名封面”能力同步扩展到远程文件源。

本轮本地文件夹手动路径已闭环：`/local-folder` 空状态新增路径输入框，可直接粘贴盘符路径或当前系统已授权可访问的 UNC 共享路径并复用现有真实目录扫描链路；设置页新增“手动路径”可用能力，SMB 仍保持“待接入”，仅说明已授权 UNC 路径可先通过该入口访问。

本轮内嵌播放 smoke 加固已闭环：`scripts/smoke-electron-embedded-local.mjs` 在本地假 Emby + 临时彩色视频链路中继续确认内嵌 mpv 非黑屏、长按倍速和 mpv 截图有效，并新增控制栏关键按钮可见、全屏进入/退出、窗口缩到 960×620 后无横向溢出与彩色视频像素检测，避免后续改动悄悄破坏内嵌窗口同步。

本轮远程文件源封面代理已闭环：Electron 桌面端的 `list_webdav_folder` 与 `list_alist_folder` 会把同源远程封面注册为 `hills-image://file/...`，由主进程使用连接凭据拉取图片并复用缓存；有鉴权 header 时不同源外部 `thumb` 不会被代理，避免把 WebDAV 密码或 Alist Token 发给第三方域名。Web Preview 仍以原始 URL 展示，需鉴权 header 的远程封面加载以桌面端为准。

本轮远程封面代理 smoke 已闭环：新增 `scripts/smoke-electron-remote-poster-proxy.mjs`，启动本地私有 WebDAV mock 后通过 Electron renderer 调用 `list_webdav_folder`，确认同名封面被替换为 `hills-image://file/...`；随后在 renderer 中 fetch 该协议 URL，mock 服务端收到带 Basic Auth 的图片 GET，覆盖了桌面端私有 WebDAV 封面加载链路。

---

## 10. Phase 2 待办

- 播放窗口内嵌已通过本地屏幕像素 smoke，且自动覆盖控制栏关键按钮、全屏进入/退出和窗口 resize 后像素检测；后续仍建议用真实媒体人工走一遍长时间播放、全屏和窗口 resize 体验。
- 文件源能力目前已支持“打开单个本地视频文件”、本地文件夹手动路径输入、本地文件夹一层/递归视频浏览、本地文件夹列表搜索/排序/分组与播放队列、同名封面、同名 NFO 元数据、同名字幕自动关联及列表提示、同名 XML 弹幕自动关联及列表提示、最近本地文件入口、最近本地文件夹入口、收藏本地文件、收藏本地文件夹、WebDAV 基础目录浏览/直链播放、WebDAV 播放队列、WebDAV 收藏/最近入口、WebDAV 上次目录/路径标签、WebDAV 列表搜索/排序、WebDAV 同名封面提示、WebDAV 同名字幕提示/加载、WebDAV 同名 XML 弹幕提示/加载、WebDAV 路径面包屑、WebDAV 当前路径操作、Alist/OpenList 基础目录浏览/直链播放、Alist/OpenList 收藏/最近入口、Alist/OpenList 上次目录/路径标签、Alist/OpenList 同名封面提示、Alist/OpenList 播放前刷新视频和侧挂直链、Alist/OpenList 同名字幕/XML 弹幕提示与加载；在线元数据刮削、SMB 完整发现/凭据存储和 Plex 仍待后续分阶段接入。
