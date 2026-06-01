# Hills Lite 当前项目状态快照

> 更新时间：2026-06-02（真实服务器脱敏复测）
>
> 规格：[`UI_REFERENCE_HILLS_LITE.md`](./UI_REFERENCE_HILLS_LITE.md)
>
> 最新变更日志：[`CHANGE_LOG/2026-06-02-0744-real-server-sanitized-rerun.md`](./CHANGE_LOG/2026-06-02-0744-real-server-sanitized-rerun.md)

---

## 0. 最新视觉修正阶段

- 详情页 `/item/:id` 现在使用 fullscreen app shell，隐藏主侧栏和顶栏并铺满窗口，退出依靠详情页自身返回按钮；这是为了匹配用户参考图中“剧集页打满”的视觉目标。
- 首页/详情 smoke 现在把详情页壳层也纳入断言：详情页仍显示主侧栏/顶栏，或 hero 未从窗口原点铺满，都会失败。
- 2026-06-02 07:40 回归已通过：`node --check scripts\smoke-electron-home-hero.mjs`、`npm.cmd run build`、`node scripts\smoke-electron-home-hero.mjs`、`node scripts\smoke-electron-embedded-local.mjs` 和保留截图版播放 smoke 均通过；已人工视检首页、紧凑首页、详情页和播放页截图。
- 2026-06-02 07:44 真实服务器脱敏复测：普通沙箱网络下两条线路均 `fetch failed`；提权网络下 line1 公开信息/认证/媒体库视图均 HTTP 200，识别为 Emby，媒体库视图数量 5；line2 公开信息 HTTP 403 HTML，未进入登录。
- Electron 播放页为避免 Windows `--wid` 原生嵌入窗口黑屏，当前默认走 HTML video 的应用内直连播放路径；本机解码/禁止转码契约仍由 PlaybackSource 链路保证，Tauri 仍保留原生 mpv 嵌入判断。新版播放 smoke 要求可见截图像素通过，不能再用 mpv 内部截图替代用户实际可见画面。
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
| Electron unpacked | `release-electron\win-unpacked\Hills Lite.exe` |
| Electron portable | 当前不存在；旧 `release-electron\Hills Lite 0.1.0.exe` 已删除 |
| Tauri release exe | `src-tauri\target\release\emby-player.exe` |
| 内置 mpv | `release-electron\win-unpacked\resources\mpv\mpv.exe`；Tauri 为 `src-tauri\target\release\resources\mpv\mpv.exe` |

历史流水和每轮验证保留在 [`CHANGE_LOG`](./CHANGE_LOG/)；本文件只记录当前可执行状态，避免旧阶段描述误导后续判断。

当前最新 Electron unpacked 产物已刷新：`A:\vsc\emby-player\release-electron\win-unpacked\Hills Lite.exe`，文件时间 2026-06-02 05:52:59；随包 `resources\electron_mpv_host.exe` 文件时间 2026-06-02 05:52:57。

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

- 播放窗口仍在应用内；Electron 当前默认使用 HTML video 渲染直连流以避开 Windows `--wid` 黑屏，Tauri 路径继续保留原生 mpv 嵌入。
- 默认只使用应用随包 mpv；不扫描系统 PATH、不读取旧 vendor mpv、不提供用户选择 mpv 路径。
- 全屏阶段视频舞台铺满 viewport，控制层作为覆盖层，不再挤压视频区域。
- 后退/前进使用运行时相对 seek；后退、全屏、窗口缩放、控制栏可见性和退出清理已进入 Electron smoke。
- Electron 可见播放 smoke 已覆盖 HTML video 启动、直连/非转码 PlaybackInfo 契约、后退、长按倍速、真全屏、自适应、可见截图像素和关闭清理；截图必须有真实画面才允许通过。
- 原生 `electron_mpv_host.exe` / 随包 `mpv.exe` 仍保留为 Electron 后端能力，但不再作为 Electron 播放页默认渲染路径，避免 mpv 内部有帧而用户窗口纯黑的误判。
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
- 当前工作区无意外未跟踪文件；Electron 命令覆盖为 104/104，显式 no-op 命令为 0。首页 smoke 已覆盖双服务器同名同 ID 收藏/历史/聚合/搜索记录不会被合并、收藏/历史/聚合卡片缺 Backdrop 时的图片回退解码、单集只有父级 Thumb 时仍能加载图片、巨幕 Logo 艺术标题图加载、巨幕无右侧海报且点击进入详情、侧边栏汉堡按钮折叠/展开、添加服务器弹窗账号/密码/任意端口/自动类型与名称、线路高级 UA，以及 960×600 compact 窗口下巨幕首屏自适应。

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
