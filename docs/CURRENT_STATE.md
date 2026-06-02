# Hills Lite 当前项目状态快照

> 更新时间：2026-06-02（Git push compact detail refresh）
>
> 规格：[`UI_REFERENCE_HILLS_LITE.md`](./UI_REFERENCE_HILLS_LITE.md)
>
> 最新变更日志：[`CHANGE_LOG/2026-06-02-1620-git-push-compact-detail-refresh.md`](./CHANGE_LOG/2026-06-02-1620-git-push-compact-detail-refresh.md)

---

## 0. 最新视觉修正阶段
- 2026-06-02 16:20 已把详情页紧凑标题修复与 Electron unpacked 刷新两个本地提交推送到 GitHub：`origin/main` 从 `8c49635` 更新到 `3a503d0`。推送前 `git diff --name-only HEAD` 无输出；`git status` 仍显示多项 `M`，但当前判断为索引/时间戳噪声而非实际内容 diff。本阶段未修改功能代码，属于 Git 同步闭环；下一步继续审计用户反馈清单中仍缺少当前证据或仍需真实多尺寸视检的项目。
- 2026-06-02 15:33 已刷新包含详情页紧凑标题修复的 Electron unpacked 产物：`release-electron\win-unpacked\Hills Lite.exe` 文件时间 2026-06-02 15:32:43，`resources\electron_mpv_host.exe` 文件时间 2026-06-02 15:32:41。`npm.cmd run electron:build` 通过，包含 Electron 命令覆盖检查、本机解码 guard、no-planned-ui、Vue 类型检查、Vite 生产构建、helper release build、`electron-builder --win dir` 和 `check:electron-package`；本阶段仍未生成 portable 单文件包。
- 2026-06-02 15:26 已修复真实详情页紧凑窗口长标题被顶边裁切的问题：`DetailView.vue` 在窄宽或低高窗口下为 hero 内容设置顶边约束、紧凑标题/间距和滚动兜底；真实 visual smoke 新增 `detailTitle` / `detailTitleClipped` 指标，并在详情页或剧集详情标题越出视口时直接失败。`node --check scripts\real-server-visual-smoke.mjs`、`npm.cmd run build`、`node scripts\smoke-electron-home-hero.mjs` 和真实账号 `node scripts\real-server-visual-smoke.mjs` 已通过；人工复核新保留截图确认 `detail-960x600.png`、`detail-760x430.png`、`series-detail-960x600.png` 标题不再裁切，首页紧凑巨幕仍保持固定比例并露出继续观看。播放器仍按“就绪后额外等待 5 秒截图”执行，seek/fullscreen/resize/退出清理通过，且未生成 `player-native-host.png` 误导性截图证据。
- 2026-06-02 15:18 真实服务器多尺寸 visual smoke 已重跑并保留截图，自动化输出 `ok: true`、`failures: []`：真实 Emby 登录、5 个首页尺寸、5 个详情页尺寸、5 个 Series 详情尺寸、个人页、搜索、Series 详情播放进入具体单集、详情页播放、播放器就绪后额外等待 5 秒截图、后退、全屏、播放器缩放和退出清理均完成；PlaybackInfo 仍为 `DirectPlay` 且 `supportsTranscoding: false`。但人工复核保留截图时发现 `detail-960x600.png` 的长标题顶部裁切，因此本轮不能记为完整视觉通过；下一步先修详情页紧凑窗口标题裁切，并补脚本断言。
- 2026-06-02 15:13 已提交并推送原生截图防误抓与历史/收藏图片候选修复：本地提交 `aea1cf6 Fix native smoke capture and card images` 已推送到 `origin/main`，远端从 `9e74a45` 更新到 `aea1cf6`。普通沙箱推送仍因 `SEC_E_NO_CREDENTIALS` 失败，使用本机 Git 凭据上下文重试后成功。下一步仍需在明确网络批准后重跑真实服务器多尺寸 visual smoke；该脚本已保持“播放器可见状态就绪后额外等待 5 秒再截图”的规则。
- 2026-06-02 15:09 针对真实视检截图复核发现的桌面/其他窗口误抓问题，真实 visual smoke 已改为只有拿到受控原生宿主窗口句柄时才抓 native host 截图；无句柄时记录 `player-native-capture-skipped`，继续使用应用内播放器截图和 mpv 状态作为证据，避免再把桌面截图误当播放证据。同时调整卡片图片候选顺序，优先使用带 tag 的父级 Backdrop/Thumb/Primary，再走无 tag 兜底，以改善真实历史/收藏中 Episode 图片加载。`node --check scripts\real-server-visual-smoke.mjs`、`npm.cmd run build`、`node scripts\smoke-electron-home-hero.mjs` 已通过；本地 smoke 中历史图片 3/3、收藏 2/2、聚合 6/6 均加载。真实服务器在图片候选顺序修复后的最终复测仍待用户明确批准网络升级重跑。
- 2026-06-02 14:56 已提交并推送本轮 PosterCard 激活、CDP smoke 加固、真实 smoke 脱敏和阶段日志：本地提交 `7404a05 Fix poster activation real smoke` 已推送到 `origin/main`，远端从 `2115d94` 更新到 `7404a05`。普通沙箱推送仍因 `SEC_E_NO_CREDENTIALS` 失败，使用本机凭据上下文重试后成功。
- 2026-06-02 14:52 脱敏后的真实服务器 visual smoke 已通过，最终 `ok: true`、`failures: []`。本轮覆盖真实 Emby 识别和登录、5 个首页尺寸、5 个详情页尺寸、5 个 Series 详情尺寸、收藏/历史/聚合路由、搜索、真实 Series 详情点击进入具体单集、真实详情页点击进入播放器、播放器可见状态就绪后额外等待 5 秒截图、后退从约 15000 ms 到约 5000 ms、全屏、1366×768 / 960×600 / 760×430 播放器缩放，以及退出后 Electron/mpv 子进程清理。真实 PlaybackInfo 选择 `DirectPlay`，媒体源 `supportsTranscoding: false`，继续满足本机解码硬约束。
- 2026-06-02 14:50 已给真实服务器 visual smoke 增加统一敏感值脱敏：阶段输出、CDP 调用错误、CDP evaluate 异常和最终 JSON 都会替换输入的线路 URL、URL origin/host、用户名和密码。`node --check scripts\real-server-visual-smoke.mjs` 已通过。上一轮交互重跑在播放前失败，原因是 TTY 隐藏输入未逐项回车导致字段拼接；下一轮必须逐字段输入并继续真实服务器多尺寸视检。
- 2026-06-02 14:44 已将 `PosterCard` 激活从单纯组件事件补强为显式 `activateHandler` 回调，同时保留原 `activate` 事件兼容旧调用；收藏、历史、聚合视界、首页搜索、媒体库、类型、人员和工作室列表的卡片打开都已改走显式回调。本地 Electron smoke 已通过并输出 `ok: true`：脚本用真实鼠标事件点击跨服务器同名收藏/历史卡片，确认会切到对应服务器/账号，并进入带 `server` / `account` query 的详情页。真实播放 visual smoke 的截图策略继续保持“播放器可见状态就绪后额外等待 5 秒再截图”；下一步重跑真实服务器多尺寸视检。
- 2026-06-02 13:54 已在可用本机凭据上下文中重新执行 `git push origin main` 并成功更新远端：`origin/main` 从 `7081b28` 推进到 `59ba2a5 Fix series detail playback smoke`。此前 `SEC_E_NO_CREDENTIALS` 属于沙箱/本机凭据上下文问题，不是仓库或代码失败。下一步继续完整目标缺口审计，优先找仍缺少真实多尺寸证据或仍可能只被本地 fake smoke 覆盖的用户反馈项。
- 2026-06-02 13:52 已将 Series 详情播放修复、真实账号视觉 smoke 补强、真实 Series 诊断脚本和阶段日志提交到本地 `main`；初始本地提交为 `9bf31e7`，补入本阶段日志后 amend 为 `59ba2a5 Fix series detail playback smoke`。普通 `git push origin main` 未更新远端，原因是当前 Git 凭据不可用并返回 `SEC_E_NO_CREDENTIALS`；当时本地分支领先 `origin/main` 1 个提交。提交后 `git diff --name-status` 无内容差异，并确认没有残留 `electron` / `mpv` / `electron_mpv_host` / `Hills Lite` 进程。
- 2026-06-02 13:40 已刷新 Electron unpacked 产物：`release-electron\win-unpacked\Hills Lite.exe` 文件时间 2026-06-02 13:40:17，`resources\electron_mpv_host.exe` 文件时间 2026-06-02 13:40:14。`npm.cmd run electron:build` 通过，包含命令覆盖检查、本机解码 guard、planned UI 检查、`vue-tsc --noEmit`、Vite 生产构建、Electron helper release build、`electron-builder --win dir` 和 `check:electron-package`。portable 单文件包未由本命令生成；下一步检查提交范围和敏感信息后处理 Git。
- 2026-06-02 13:36 完整真实账号视觉 smoke 已通过，最终输出 `ok: true` 且 `failures: []`。真实 Series 详情 `/item/34743` 点击播放已进入具体单集 `/player/34758?...&from=34743`，播放器先等待可用播放状态，再额外等待 5 秒后截图；原生 mpv 窗口像素非黑屏，seek 从约 15000 ms 回退到约 5000 ms，全屏、播放器缩放和退出子进程清理均通过。下一步检查打包产物是否因本轮 `DetailView.vue` 与 smoke 脚本变更而需要刷新。
- 2026-06-02 13:33 真实账号 smoke 已确认 Series 详情播放修复生效：真实 Series 点击播放进入具体单集 `/player/...&from=34743`，无动作错误。随后主播放候选 25 秒内未暴露 duration/tracks/videoParams，seek 调用触发 mpv 命令错误导致脚本提前退出。已修正 smoke：播放器未就绪时跳过 seek 并记录失败项，不再崩溃；`node --check scripts\real-server-visual-smoke.mjs` 已通过。下一步继续重跑完整真实账号视觉 smoke，获取最终 pass/fail JSON。
- 2026-06-02 13:30 Series 请求序列修复后，本地 Electron smoke 再次通过，输出 `ok: true`。下一步继续完整真实账号视觉 smoke，重点验证真实 Series 详情播放是否进入具体单集播放器，以及播放器截图延迟后的画面判定。
- 2026-06-02 13:29 已新增真实 Series 计数诊断脚本并定位到服务端接口本身能返回单集：失败 Series 有 1 季、12 个 Episode，`Shows/{seriesId}/Episodes`、带 `SeasonId`、以及按季 `ParentId` 查询均能拿到单集。由此修正 `DetailView.vue` 的 Series 播放请求序列：播放按钮自己的单集查询不再因为同一详情页内季 watcher 的 `episodeLoadSeq` 刷新而被误判过期，只在详情页或 Series id 真正变化时中止。`node --check scripts\real-server-series-diagnose.mjs`、真实诊断脚本、`npm.cmd run build` 已通过；下一步重跑 Electron smoke 与真实账号视觉 smoke。
- 2026-06-02 13:24 按用户反馈调整真实播放视检：起播不是瞬时完成，真实 smoke 现在会先等待播放器暴露可用视频状态，再额外等待 5 秒后截图，并输出 `player-visual-ready` 阶段信息。`node --check scripts\real-server-visual-smoke.mjs` 已通过。此改动仅提高视检有效性，不代表 Series 详情播放或真实播放画面已通过；下一步继续诊断 Series 单集接口与重跑真实 smoke。
- 2026-06-02 13:20 真实账号 smoke 重跑时在详情页尺寸检查阶段被 `Runtime.evaluate: Execution context was destroyed` 打断。已把 CDP 上下文重试扩展到真实视觉 smoke 的路由/resize/metrics 读取路径，包括 `resizeAndInspect`、个人页检查、搜索、播放器打开等待、seek/fullscreen/player resize 指标读取；登录/setup 仍不重试，避免重复写入服务器/账号状态。`node --check scripts\real-server-visual-smoke.mjs` 已通过，下一步继续完整真实账号视觉 smoke。
- 2026-06-02 13:18 Series 跨季兜底修复后，本地 Electron smoke 再次通过并输出 `ok: true`；覆盖 fake Emby Series 详情播放入口、首页巨幕固定比例、多服务器收藏/历史/聚合、搜索同名多服务器、侧边栏折叠、亮色主题和添加服务器 UI。下一步重跑真实账号视觉 smoke。
- 2026-06-02 13:16 真实账号视觉 smoke 已定位 Series 播放业务失败：`/item/34743` 顶部播放按钮可见且可点，但点击后仍停留在详情页并提示“当前剧集没有可播放单集。”原因是 Series 播放入口只检查活动季/第一季，真实服务端该 Series 的第一候选季没有可播放单集。已修复为按活动季、所有已知季、全剧单集兜底依次寻找可播放单集，并继续优先续播未看完单集。`npm.cmd run build` 已通过；下一步重跑本地 Electron smoke 与真实账号视觉 smoke。
- 2026-06-02 13:13 真实账号视觉 smoke 首跑到达 Series 详情播放探针后，脚本被 `Runtime.evaluate: Execution context was destroyed` 打断；这不是播放通过结果，已将探针拆为短 CDP 步骤并增加路由切换时的上下文重试：进入 Series 详情、轮询播放按钮位置、CDP 点击、轮询 `/player/:episodeId`、停止播放并回到首页。`node --check scripts\real-server-visual-smoke.mjs` 已通过，下一步立即重跑完整真实账号视觉 smoke。
- 2026-06-02 13:09 本地门禁已通过：`node --check scripts\smoke-electron-home-hero.mjs`、`npm.cmd run build`、`node scripts\smoke-electron-home-hero.mjs` 均通过；本地 Electron smoke 输出 `ok: true`，覆盖 fake Emby 的 Series 详情播放入口探针、首页巨幕固定比例、多服务器收藏/历史/聚合、搜索同名多服务器结果、侧边栏折叠、亮色主题和添加服务器 UI。下一步继续真实账号真实服务器视觉 smoke。
- 2026-06-02 13:05 已补强真实服务器视觉 smoke 的 Series 详情播放探针：脚本现在会搜索真实 `Series` 候选，按 1920×1080、1366×768、1024×768、960×600、760×430 视窗检查 Series 详情布局，再从 Series 顶部播放按钮点击并断言进入具体 `/player/:episodeId`，同时确认没有打开 Series 本身；探针结束会立即 `player.stop()`，避免前一段验证留下后台播放。已通过 `node --check scripts\real-server-visual-smoke.mjs`。下一步继续跑本地构建/本地 Electron smoke，并在需要网络时用真实账号跑完整真实环境链路。
- 2026-06-02 13:02 已刷新包含 Series 播放入口修复的 Electron unpacked 产物：`release-electron\win-unpacked\Hills Lite.exe` 文件时间 2026-06-02 13:02:31，`resources\electron_mpv_host.exe` 文件时间 2026-06-02 13:02:29。`npm.cmd run electron:build` 通过，包含命令覆盖检查、前端生产构建、helper release build、`electron-builder --win dir` 和 `check:electron-package`。portable 单文件包仍未生成；下一步继续用真实账号/真实服务器验证实际播放器打开链路。
- 2026-06-02 12:58 修复 Series 详情页播放入口空点：此前真实播放 smoke 只覆盖 Movie/Episode，未覆盖 Series；当集列表尚未加载完成或 `continueEpisode` 为空时，Series 顶部播放按钮会静默返回，用户体感为“根本没打开”。现已改为点击时主动加载季和单集，选择续播集或第一集进入 `/player/:episodeId`，无单集时显示动作错误。`node --check scripts\smoke-electron-home-hero.mjs`、`npm.cmd run build` 和 `node scripts\smoke-electron-home-hero.mjs` 已通过；本地 fake Emby smoke 新增 Series / Season / Episodes 探针，并断言 `/item/smoke-series` 点击播放进入 `/player/resume-episode...`。下一步继续验证 packaged exe 与真实账号真实服务器的实际播放器打开链路。
- 2026-06-02 12:47 已提交并推送真实 Electron mpv 播放修复：本地提交 `064e2e0 Fix real Electron mpv playback path` 已推送到 `origin/main`，远端从 `9a3c322` 更新到 `064e2e0`。提交前通过 `git diff --cached --check`、敏感字面量扫描、`npm.cmd run check:workspace`，测试账号/密码/完整线路 URL 未写入仓库。
- 2026-06-02 12:44 已刷新 Electron unpacked 产物：`release-electron\win-unpacked\Hills Lite.exe`，文件时间 2026-06-02 12:44:28；`resources\electron_mpv_host.exe` 文件时间 2026-06-02 12:44:25。`npm.cmd run electron:build` 通过，包含命令覆盖、生产构建、helper release build、`electron-builder --win dir` 和 `check:electron-package`；本阶段未生成 portable 单文件包。
- 2026-06-02 12:40 真实账号默认 Electron overlay mpv 视觉 smoke 已通过：脚本现在从真实详情页点击播放按钮进入播放器，而不是直接跳 `/player/:id`；真实 MKV 继续走随包 mpv 本机 DirectPlay，暴露 duration/position/tracks/codec/D3D11 参数并采集到有效可见视频帧。后退从 15s 精确回到 5s，全屏、1366×768、960×600、760×430 缩放控件与退出清理均通过，最终失败项为空。上一轮“player screenshot is visually black/blank”是暗场真实帧被过严色彩阈值误判，已修正为亮度或色彩任一足够即可通过，仍会拦截全黑窗口。
- 2026-06-02 12:29 真实账号默认 Electron overlay mpv 视觉 smoke 已重跑：真实登录、媒体库、详情页多尺寸均可达，播放器已通过随包 mpv 打开真实 MKV，暴露 duration/position/tracks/codec/D3D11 参数并采集到有效视频像素；全屏、缩放控件和退出清理进入可验证状态。剩余失败收敛为 3 项：760×430 首页巨幕比例漂移到约 3.08、搜索未命中本轮选中真实条目、后退断言未观察到 position 回退。
- 2026-06-02 12:18 Electron 播放默认路径已从 Chromium HTML video 改为随包 mpv 覆盖窗口本机解码；旧 `--wid` 宿主只在 `HILLS_ELECTRON_MPV_WID=1` 时启用。原因是当前真实账号选中的直连/直流 MKV 在 HTML video 下返回 media error code 4，实际表现应归类为“播放器没有成功打开真实画面”。本阶段本地 Electron mpv smoke 已通过，下一步必须用真实账号重跑默认路径视觉回归。
- 2026-06-02 11:18 已废弃上一轮桌面级截图证据，改为应用内/进程句柄限定的原生视觉取证：Electron 本地嵌入 smoke 现在分开采集 Vue 控件层 CDP 截图与 mpv 宿主窗口句柄截图，并用 `get_embed_state` 返回的主窗口/内容区/宿主 bounds 校验截图是否落在播放器矩形内。本阶段不是播放通过：BrowserWindow 宿主路径功能、矩形、本机解码契约和退出清理均通过但宿主截图全黑；native child 路径初始 1280×800 与全屏有有效视频像素，但退出全屏后 resize/compact 仍变黑。下一步先阻止 native child helper 在 rect 更新时把 mpv 宿主窗口刷黑，重建 helper 后复测。
- 2026-06-02 11:00 已新增并运行脱敏 PlaybackInfo 媒体源检查脚本：本轮真实失败条目有 2 个媒体源，均为 MKV 且均支持本机直连/直流、禁用转码；候选 1 为 H264/AAC in MKV，候选 2 为 HEVC/FLAC in MKV。该条目不存在可直接交给 Electron HTML video 的 MP4/MOV 版本，因此不能用“自动选择 HTML 兼容源”解决真实 MKV 播放。下一步必须让 Electron 在服务端不转码的前提下恢复可靠的本地播放器路径。
- 2026-06-02 10:55 真实账号/真实服务器视觉 smoke 仍未通过：线路 1 可识别为 Emby、可登录并加载 5 个媒体库视图，真实首页/详情图片可见，详情页壳层无主侧栏/顶栏，退出清理通过；但选中的真实源为 MKV/H264/AAC，Electron HTML video 报 media error code 4，导致播放器无解码尺寸、无时长、画面失败、后退不可验证。另有 760×430 首页巨幕比例约 3.08 超出固定比例范围，搜索未返回本轮选中的真实条目。下一步先检查真实 PlaybackInfo 媒体源候选并优先选择直连/直流且 HTML 可播放的源；若无兼容源，Electron 必须回到可靠的应用内 mpv 支持，不能把 HTML video 当作覆盖 MKV 的最终方案。
- 2026-06-02 10:51 已刷新 Electron unpacked 产物：`release-electron\win-unpacked\Hills Lite.exe`，文件时间 2026-06-02 10:51:19；`resources\electron_mpv_host.exe` 文件时间 2026-06-02 10:51:16。`npm.cmd run electron:build` 通过，包含命令覆盖、生产构建、helper release build、`electron-builder --win dir` 和 `check:electron-package`；旧 portable 单文件包仍不存在。
- 2026-06-02 10:48 已完成 Electron 默认 HTML 播放修正后的构建门禁：`git diff --check` 仅有换行转换提示，`npm.cmd run build` 通过，包含 `check:local-decode`、`check:no-planned-ui`、`vue-tsc --noEmit` 和 Vite build；没有引入本机解码契约回退。下一步刷新 Electron packaged output，并继续真实服务器多尺寸视检。
- 2026-06-02 10:46 已把 Electron 默认播放路径恢复为应用内 HTML video 直连播放；原生 mpv `wid` 嵌入只在显式 `?nativeMpv=1` 调试时启用，Tauri 仍保留原生 mpv 路径。本地 Electron 播放 smoke 已通过，断言 `mode=html`、`htmlVideoCount=1`、启动时无 native embed 状态、后退/全屏/缩放/compact/退出清理和本机解码契约均通过；已人工视检四个窗口尺寸截图，画面只包含应用内测试视频与控件，没有接受桌面或其他窗口泄漏作为证据。该结论只覆盖本地可见播放链路，真实账号/真实服务器多尺寸视检仍必须继续。
- 2026-06-02 10:32 针对“截图透出桌面/其他窗口”继续复核 mpv 嵌入背景参数：`--alpha=no` 会导致 mpv 在 IPC 就绪前退出，单独改成 `--background-color=#000000` 会让 `vo/direct3d` 初始化失败并产生全黑可见截图；该尝试已回滚，不能宣称 Electron 原生 `wid` 播放修复完成。下一步必须换更可靠的 Electron 可见播放策略，而不是继续用颜色参数掩盖问题。
- 2026-06-02 10:17 继续复核 Electron 原生 mpv 渲染矩阵：`wid` + 旧 GPU 禁用会出现桌面/其他窗口透出，`wid` + 默认 GPU 合成变成可见黑屏，去掉 helper 命中穿透无改善，overlay 后备的层级/位置也不稳定；本阶段仍判定播放器可见渲染不通过。当前保留 `--no-config` 与可选 `HILLS_ELECTRON_DISABLE_GPU=1` 以便后续实验，但不能宣称 Electron native mpv 嵌入已修复。
- 2026-06-02 10:00 已人工复核最新 Electron `wid` 嵌入本地播放器截图：功能链路有进展，但窗口模式仍出现桌面/其他窗口内容透出，阶段结论为不通过；不能把脚本 JSON 或全屏单张截图当作播放修复完成证据。后续截图必须绑定当前测试进程树和后端返回的顶层窗口句柄，且通过前必须做多尺寸人工视检与真实服务器复测。
- 2026-06-02 08:46 新增真实账号视觉 smoke，并已用真实服务器跑出未通过项：线路 1 可登录并加载媒体库，线路 2 公开信息 403；首页 compact 巨幕比例仍漂移，1366x768 下第二行露出不足；真实 MKV 源在 Electron HTML video 下报 media error code 4，播放器可见画面/seek/resize 控制不能算通过。退出清理已通过，未留下被跟踪的 mpv/helper 子进程。
- 2026-06-02 08:36 阶段只保留 `src/utils/mediaImages.ts` 的剧集/父级图片回退修正；Electron 原生 mpv `--wid` 嵌入实验已回滚，因为本地直接解码、seek、全屏、resize 与清理虽然可跑通，但用户可见窗口像素仍为黑屏，不能算播放修复通过。
- 下一轮必须继续用真实账号、真实服务器和多个窗口尺寸/比例做视检；所有通过结论都必须以用户可见截图/像素和真实功能链路为准，不能只看 mpv 内部截图或本地模拟数据。

- 详情页 `/item/:id` 现在使用 fullscreen app shell，隐藏主侧栏和顶栏并铺满窗口，退出依靠详情页自身返回按钮；这是为了匹配用户参考图中“剧集页打满”的视觉目标。
- 首页/详情 smoke 现在把详情页壳层也纳入断言：详情页仍显示主侧栏/顶栏，或 hero 未从窗口原点铺满，都会失败。
- 2026-06-02 07:40 回归已通过：`node --check scripts\smoke-electron-home-hero.mjs`、`npm.cmd run build`、`node scripts\smoke-electron-home-hero.mjs`、`node scripts\smoke-electron-embedded-local.mjs` 和保留截图版播放 smoke 均通过；已人工视检首页、紧凑首页、详情页和播放页截图。
- 2026-06-02 07:44 真实服务器脱敏复测：普通沙箱网络下两条线路均 `fetch failed`；提权网络下 line1 公开信息/认证/媒体库视图均 HTTP 200，识别为 Emby，媒体库视图数量 5；line2 公开信息 HTTP 403 HTML，未进入登录。
- 2026-06-02 07:48 已刷新 Electron unpacked 产物：`A:\vsc\emby-player\release-electron\win-unpacked\Hills Lite.exe`，文件时间 2026-06-02 07:48:29；`check:electron-package` 确认随包 mpv、helper 和 app.asar 完整。
- Electron 播放页为避免 Windows `--wid` 原生嵌入窗口黑屏或桌面泄漏，当前默认走 HTML video 的应用内直连播放路径；本机解码/禁止转码契约仍由 PlaybackSource 链路保证，Tauri 仍保留原生 mpv 嵌入判断，Electron native mpv 嵌入只允许作为显式调试路径。新版播放 smoke 要求可见截图像素通过，不能再用 mpv 内部截图替代用户实际可见画面。
- 首页巨幕已从 viewport 高度驱动改为宽度驱动的固定横幅比例，目标是在小窗口下让继续观看与媒体库进入首屏视野，而不是用巨幕挤掉下方内容。
- 详情页首屏已改为全高沉浸背景：左下保留播放/收藏/下载/标题/元信息，右下展示版本、音频、字幕和本机解码能力信息。
- 详情页播放入口会携带当前媒体源到播放器，播放器启动时读取 `lineId` / `mediaSourceId`，避免首次播放丢失用户选择。
- 新一轮视觉 smoke 已升级断言 compact 首页两排可见、详情页 hero 全高和右下控制面板；已通过 `node scripts\smoke-electron-home-hero.mjs`，并人工检查 `home-compact.png`、`home-hero.png`、`detail-hero.png`。

## 1. 概览

| 项 | 当前值 |
|---|---|
| 路径 | `A:\vsc\emby-player` |
| 显示名 | Hills Lite |
| 主运行壳 | Electron + Vue 3 + TypeScript |
| Tauri 状态 | 保留可运行路径，`tauri.conf.json` 当前 `bundle.active: false` |
| Electron unpacked | `release-electron\win-unpacked\Hills Lite.exe`（2026-06-02 15:32:43 刷新） |
| Electron portable | 当前不存在；旧 `release-electron\Hills Lite 0.1.0.exe` 已删除 |
| Tauri release exe | `src-tauri\target\release\emby-player.exe` |
| 内置 mpv | `release-electron\win-unpacked\resources\mpv\mpv.exe`；Tauri 为 `src-tauri\target\release\resources\mpv\mpv.exe` |

历史流水和每轮验证保留在 [`CHANGE_LOG`](./CHANGE_LOG/)；本文件只记录当前可执行状态，避免旧阶段描述误导后续判断。

当前最新 Electron unpacked 产物已刷新：`A:\vsc\emby-player\release-electron\win-unpacked\Hills Lite.exe`，文件时间 2026-06-02 15:32:43；随包 `resources\electron_mpv_host.exe` 文件时间 2026-06-02 15:32:41。

当前 Electron portable 单文件包尚未刷新成功，旧 `A:\vsc\emby-player\release-electron\Hills Lite 0.1.0.exe` 已删除。`npm.cmd run electron:dist` 在 `electron-builder --win portable` 阶段因 GitHub NSIS 依赖下载超时失败；如需 portable，需要重新生成新的单文件包。

当前项目指导文档也已同步：`PROJECT_MEMORY.md` 与 `STANDARDS.md` 不再作为旧路线清单，而是指向当前 Electron 主线、随包 mpv、本机解码硬约束、阶段日志/提交/推送节奏和安全边界。

工作区卫生检查已接入 `npm.cmd run check:workspace`：该脚本允许当前 6 个运行/构建目录，拦截意外未跟踪文件和意外忽略目录，用来避免旧临时文件、旧 Git 目录或散落构建日志重新污染仓库判断。

旧 `scripts/smoke-test.ps1` 已删除；该脚本仍含 Tauri-first 流程和 PATH mpv 误导提示，当前验证入口以 `npm.cmd run build`、Electron 打包检查和 Electron smoke 脚本为准。

真实服务器复核使用 `scripts\real-server-connectivity-check.mjs`：脚本从 stdin 或 `HILLS_REAL_*` 环境变量读取线路和测试账号，只输出脱敏状态，不输出 token、账号、密码、完整线路 URL 或播放 URL。已通过临时 stdin 输入文件执行真实线路检查，并在执行后删除临时输入文件；线路 1 公开信息、认证、媒体库视图均为 HTTP 200，识别为 Emby，媒体库视图数量 5；线路 2 在公开信息阶段返回 HTTP 403 HTML，未进入登录。

关闭语义已收紧：设置页不再展示“关闭时最小化到托盘”旧开关，配置读写会过滤 `closeToTray` / `close_to_tray` 旧字段。窗口关闭继续走 runtime cleanup 与 `app.quit()`，托盘只保留显式“显示/隐藏窗口/退出”菜单动作，避免用户点关闭后误以为应用退出但播放仍藏在后台。

首页首屏不再弹出“开始使用 Hills Lite”引导层；首次进入会直接露出真实媒体库巨幕或服务器/登录空态，旧 `firstRunCompleted` 配置字段由运行时设置归一化过滤。

---

## 2. 当前产品面

- 主导航保留首页、收藏、历史、聚合视界、服务器状态/切换与设置；下载、通知、遥控、服务器显示/隐藏等管理动作集中到设置页。
- 左上角汉堡按钮可折叠/展开侧边栏，折叠后保留图标导航、服务器状态点和设置入口，状态保存在 `localStorage`。
- 添加服务器表单直接提供用户名、密码、线路地址和任意端口输入；服务端名称与 Emby/Jellyfin 类型由公开信息接口自动识别。
- 保存服务器会追加记录，不覆盖原服务器；已保存服务器的线路编辑同样使用地址 + 端口输入，线路名为高级可选项，线路级高级设置保留 User-Agent 与 headers。
- 首页 smoke 已覆盖随机端口本地测试 Emby 的 `detect_server -> add_server -> login -> refreshHome` 链路，并断言新增服务器只追加 1 条。
- 线路延迟显示不展示 `0ms` / `1ms` 这种误导性精确值，`0-9ms` 统一显示为 `<10ms`。
- 首页巨幕默认启用 cinema 布局，从当前媒体库候选读取 Backdrop、Logo、简介、年份、播放状态与运行时信息；右侧额外海报已移除，巨幕整块可点击进入当前媒体详情，剧集标题优先使用系列名并把单集名放入副标题。
- 首页巨幕有 Emby/Jellyfin `Logo` 艺术标题图时优先显示 Logo，保留文字标题作为可访问和失败回退；巨幕背景可从父级/系列 Backdrop、Thumb、Primary 继续回退。
- 首页 compact 窗口下的 cinema 巨幕按 `100dvh` 收敛高度，低高度桌面窗口会收紧标题、简介和内容间距；Electron smoke 已覆盖 960×600 时巨幕仍在首屏内、下一段内容露出且无横向溢出。
- 收藏、历史、聚合视界和搜索已支持跨已登录账号聚合；条目保留来源服务器/账号，同名或同 ID 的不同服务器记录不会互相覆盖，点进条目会切到对应账号再进入详情/播放链路。
- 收藏、历史和聚合视界中的个人媒体卡统一为横向比例；卡片取图会从自身 Backdrop 回退到系列图或 Primary，Electron smoke 已覆盖缺 Backdrop 时仍能成功解码。
- 个人媒体卡片取图已支持 Emby/Jellyfin 父级/系列图片字段和 `Thumb` 类型；单集自身没有 Primary/Backdrop 时，会从 `ParentThumbItemId` / `ParentThumbImageTag` 等父级信息继续回退。
- 亮色主题在 Windows WebView2 无模糊降级下仍使用浅色侧栏/顶栏/薄玻璃层；通知抽屉也有亮色可读背景、悬停态和列表项。
- 通知清空由后端持久化记录清除时间与来源键；同一下载/来源通知在清空、重启 store 或旧状态导入后不会再次冒出，新来源通知仍可正常进入。
- 详情页展示媒体信息、版本能力、剧集、演职人员、相似内容、附加内容、类型/人员/工作室跳转和桌面下载入口。

---

## 3. 播放核心

- 播放窗口仍在应用内；Electron 当前默认使用随包 mpv 覆盖窗口渲染直连/直流源，避免 HTML video 无法打开真实 MKV；Tauri 路径继续保留原生 mpv 嵌入。
- 默认只使用应用随包 mpv；不扫描系统 PATH、不读取旧 vendor mpv、不提供用户选择 mpv 路径。
- 全屏阶段视频舞台铺满 viewport，控制层作为覆盖层，不再挤压视频区域。
- 后退/前进使用运行时相对 seek；后退、全屏、窗口缩放、控制栏可见性和退出清理已进入 Electron smoke。
- Electron 可见播放 smoke 已覆盖随包 mpv 启动、直连/非转码 PlaybackInfo 契约、后退、长按倍速、真全屏、自适应、可见截图像素和关闭清理；截图必须有真实画面才允许通过。
- 原生 `electron_mpv_host.exe` / `--wid` 宿主仍保留为 Electron 调试能力，但只在 `HILLS_ELECTRON_MPV_WID=1` 时启用；默认路径不再依赖 HTML video 覆盖真实 MKV。
- Electron 默认系统菜单已清空；开发工具只在显式环境变量开启时打开。

---

## 4. 本机解码硬约束

Hills Lite 的播放策略是本机解码优先且服务端不可承担视频/音频解码或转码压力。用户的服务端可能只是 NAS、路由器或低核心数 VPS，因此客户端宁可拒绝播放不可本机解码的源，也不能请求服务端解码。当前链路保持：

- `PlaybackInfo` 请求显式发送 `EnableDirectPlay=true`、`EnableDirectStream=true`、`EnableTranscoding=false`。
- Electron / Web Preview 请求保留 `EnableVideoStreamCopy=true` 与 `EnableAudioStreamCopy=true`。
- Tauri 请求保留 `enable_video_stream_copy: true` 与 `enable_audio_stream_copy: true`。
- `DeviceProfile.TranscodingProfiles` 固定为空数组。
- 播放 URL 固定走 `Videos/{id}/stream?Static=true`。
- 只接受服务端明确返回 `SupportsDirectPlay=true` 或 `SupportsDirectStream=true` 的媒体源。
- 切换线路或媒体源时，无法确认本机直连/直流能力的源会被禁用或拒绝。
- 播放进度上报只允许 `DirectPlay` / `DirectStream`，不让 `Transcode` 语义进入会话状态。
- `npm.cmd run build` 前置执行 `check:local-decode`，禁止转码 URL、服务端 HLS 转码 playlist、启用转码、禁用 stream copy 或非空转码 profile 回归。
- `scripts\smoke-electron-embedded-local.mjs` 已加入运行时合同断言：假 Emby 服务端会检查实际 `PlaybackInfo`、静态流请求和进度上报，确保没有服务端转码语义进入真实播放链路。

---

## 5. 文件与连接器

- 本地文件：支持单文件播放、最近文件、收藏文件、侧挂字幕和 XML 弹幕。
- 本地文件夹：支持手动路径、一层/递归扫描、搜索、排序、分组、收藏、最近目录、同名封面、NFO 元数据、同名字幕和 XML 弹幕提示。
- WebDAV：支持目录浏览、收藏/最近连接、路径面包屑、搜索排序、直链队列播放、同名封面、同名字幕和 XML 弹幕。
- Alist / OpenList：支持目录浏览、收藏/最近连接、路径标签、直链播放、播放前刷新签名 URL、同名封面、同名字幕和 XML 弹幕。
- SMB / Plex 当前不在主界面暴露入口；后续需要完整实现、验证和日志后再恢复入口。

---

## 6. 构建与验证入口

常用门禁：

```powershell
npm.cmd run check:local-decode
npm.cmd run check:no-planned-ui
npm.cmd run check:workspace
npm.cmd run build
npm.cmd run electron:build
cargo check --manifest-path src-tauri/Cargo.toml --all-targets
git diff --check
```

桌面 smoke：

```powershell
node --check scripts\smoke-electron-embedded-local.mjs
node scripts\smoke-electron-embedded-local.mjs
node --check scripts\smoke-electron-home-hero.mjs
node scripts\smoke-electron-home-hero.mjs
node --check scripts\real-server-visual-smoke.mjs
node scripts\real-server-visual-smoke.mjs
node scripts\check-notification-clear.mjs
```

当前最新阶段已验证：

- `npm.cmd run check:workspace`
- `npm.cmd run build`
- `npm.cmd run check:no-planned-ui`
- `npm.cmd run check:electron-commands`
- `node scripts\check-notification-clear.mjs`
- `node --check electron\main.mjs`
- `node --check scripts\smoke-electron-embedded-local.mjs`
- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- `npm.cmd run build:electron-helper`
- `npm.cmd run electron:build`
- `node scripts\smoke-electron-embedded-local.mjs`
- `node --check electron\main.mjs`
- `node --check electron\backend\emby.mjs`
- `node --check scripts\smoke-electron-home-hero.mjs`
- `node scripts\smoke-electron-home-hero.mjs`
- `node --check scripts\smoke-electron-home-hero.mjs`
- `node scripts\smoke-electron-home-hero.mjs`（新增 Series 详情页播放入口探针：`/item/smoke-series` -> `/player/resume-episode...`）
- `npm.cmd run electron:build`
- `node --check scripts\real-server-visual-smoke.mjs`（新增真实 Series 详情点击播放探针）
- `npm.cmd run build`
- `node scripts\smoke-electron-home-hero.mjs`（本地 Electron smoke `ok: true`）
- `node --check scripts\real-server-visual-smoke.mjs`（Series 探针拆短步骤并增加上下文重试）
- `npm.cmd run build`（Series 跨季/全剧单集兜底修复后通过）
- `node scripts\smoke-electron-home-hero.mjs`（Series 跨季兜底修复后本地 Electron smoke `ok: true`）
- `node --check scripts\real-server-visual-smoke.mjs`（真实 smoke 路由/resize/metrics 上下文重试扩展后通过）
- `node --check scripts\real-server-visual-smoke.mjs`（播放器状态就绪后额外等待 5 秒截图）
- `node --check scripts\real-server-series-diagnose.mjs`
- `node scripts\real-server-series-diagnose.mjs`（真实 Series 计数诊断：1 季、12 单集）
- `npm.cmd run build`（Series 请求序列修复后通过）
- `node scripts\smoke-electron-home-hero.mjs`（Series 请求序列修复后本地 Electron smoke `ok: true`）
- `node --check scripts\real-server-visual-smoke.mjs`（播放器未就绪时 seek 记录失败而非脚本崩溃）
- `node scripts\real-server-visual-smoke.mjs`（真实账号完整视觉 smoke：Series 详情播放进入具体单集；播放就绪后额外等待 5 秒截图；seek、全屏、缩放与退出清理均通过）
- `npm.cmd run electron:build`（刷新 Electron unpacked：随包 mpv、helper、app.asar 完整）
- `git diff --check`
- `npm.cmd run build`
- `node scripts\smoke-electron-embedded-local.mjs`
- `node --check scripts\real-server-visual-smoke.mjs`
- `node scripts\real-server-visual-smoke.mjs`
- `node --check scripts\smoke-electron-home-hero.mjs`（PosterCard 显式激活回调后通过）
- `node --check scripts\real-server-visual-smoke.mjs`（确认延迟截图脚本语法仍通过）
- `npm.cmd run build`（PosterCard 显式激活回调后通过）
- `node scripts\smoke-electron-home-hero.mjs`（真实鼠标点击跨服务器收藏/历史卡片，切换来源账号并保留详情 query，`ok: true`）
- `node --check scripts\real-server-visual-smoke.mjs`（真实 smoke 输出脱敏后通过）
- `node scripts\real-server-visual-smoke.mjs`（脱敏后真实服务器多尺寸 visual smoke，`ok: true`，`failures: []`）
- `node --check scripts\real-server-visual-smoke.mjs`（native host 截图跳过策略后通过）
- `npm.cmd run build`（卡片图片候选顺序调整后通过）
- `node scripts\smoke-electron-home-hero.mjs`（本地历史/收藏/聚合图片加载与跨服务器点击仍通过）
- 当前新增真实 smoke 脚本与阶段日志属于本轮预期变更；Electron 命令覆盖为 104/104，显式 no-op 命令为 0。首页 smoke 已覆盖双服务器同名同 ID 收藏/历史/聚合/搜索记录不会被合并、收藏/历史/聚合卡片缺 Backdrop 时的图片回退解码、单集只有父级 Thumb 时仍能加载图片、巨幕 Logo 艺术标题图加载、巨幕无右侧海报且点击进入详情、侧边栏汉堡按钮折叠/展开、添加服务器弹窗账号/密码/任意端口/自动类型与名称、线路高级 UA，以及 960×600 compact 窗口下巨幕首屏自适应。真实 smoke 已覆盖真实账号登录、详情页真实点击播放、可见 mpv 视频帧、seek、全屏、缩放和退出清理。

---

## 7. 工作区清理状态

`git status --short --ignored` 当前只应看到这些忽略目录：

- `.electron-user-data/`
- `.vscode/`
- `dist/`
- `node_modules/`
- `release-electron/`
- `src-tauri/target/`

这些目录分别用于本地登录态/开发配置/构建产物/依赖/发布产物/Rust target；清理前需要确认不会丢失测试登录态或构建输出。

---

## 8. 已知风险与下一步

- Codex in-app Browser 当前会话多次没有可用路由，视觉验收不能写成通过；需要依靠 Electron smoke 或可用浏览器通道复核。
- 真实长时间播放、全屏切换、窗口 resize、字幕/弹幕同屏仍建议做人工回归。
- `docs/CHANGE_LOG` 里保留所有历史阶段记录，搜索时可能命中过去的状态描述；当前事实以本文件和最新提交为准。
- 后续继续从用户问题清单推进 UI 自适应、真实服务器回归、连接器能力边界和无效入口清理。
