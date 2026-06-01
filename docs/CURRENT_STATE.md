# Hills Lite 当前项目状态快照

> 更新时间：2026-06-01（项目记忆与规范同步）
>
> 规格：[`UI_REFERENCE_HILLS_LITE.md`](./UI_REFERENCE_HILLS_LITE.md)
>
> 最新变更日志：[`CHANGE_LOG/2026-06-01-2037-project-guidance-sync.md`](./CHANGE_LOG/2026-06-01-2037-project-guidance-sync.md)

---

## 1. 概览

| 项 | 当前值 |
|---|---|
| 路径 | `A:\vsc\emby-player` |
| 显示名 | Hills Lite |
| 主运行壳 | Electron + Vue 3 + TypeScript |
| Tauri 状态 | 保留可运行路径，`tauri.conf.json` 当前 `bundle.active: false` |
| Electron unpacked | `release-electron\win-unpacked\Hills Lite.exe` |
| Electron portable | `release-electron\Hills Lite 0.1.0.exe` |
| Tauri release exe | `src-tauri\target\release\emby-player.exe` |
| 内置 mpv | `release-electron\win-unpacked\resources\mpv\mpv.exe`；Tauri 为 `src-tauri\target\release\resources\mpv\mpv.exe` |

历史流水和每轮验证保留在 [`CHANGE_LOG`](./CHANGE_LOG/)；本文件只记录当前可执行状态，避免旧阶段描述误导后续判断。

当前项目指导文档也已同步：`PROJECT_MEMORY.md` 与 `STANDARDS.md` 不再作为旧路线清单，而是指向当前 Electron 主线、随包 mpv、本机解码硬约束、阶段日志/提交/推送节奏和安全边界。

---

## 2. 当前产品面

- 主导航保留首页、收藏、历史、聚合视界、服务器与设置；下载、通知、遥控集中到设置页工具分组。
- 添加服务器表单直接提供用户名、密码、线路地址和任意端口输入；服务端名称与 Emby/Jellyfin 类型由公开信息接口自动识别。
- 保存服务器会追加记录，不覆盖原服务器；线路级高级设置保留线路名、User-Agent 与 headers。
- 首页巨幕默认启用 cinema 布局，从当前媒体库候选读取 Backdrop、Primary 海报、简介、年份、播放状态与运行时信息。
- 收藏、历史、聚合视界已接入真实账号只读接口兼容查询；收藏为空会显示为空态，不再当作加载失败。
- 详情页展示媒体信息、版本能力、剧集、演职人员、相似内容、附加内容、类型/人员/工作室跳转和桌面下载入口。

---

## 3. 播放核心

- 播放窗口为应用内嵌 mpv；Electron 通过 `electron_mpv_host.exe` 与随包 `mpv.exe` 承载，Tauri 路径继续保留。
- 默认只使用应用随包 mpv；不扫描系统 PATH、不读取旧 vendor mpv、不提供用户选择 mpv 路径。
- 全屏阶段视频舞台铺满 viewport，控制层作为覆盖层，不再挤压视频区域。
- 后退/前进使用运行时相对 seek；后退、全屏、窗口缩放、控制栏可见性和退出清理已进入 Electron smoke。
- 退出清理会等待 runtime cleanup，关闭后应无 `mpv.exe`、`electron_mpv_host.exe` 或 `Hills Lite` 残留播放进程。
- Electron 默认系统菜单已清空；开发工具只在显式环境变量开启时打开。

---

## 4. 本机解码硬约束

Hills Lite 的播放策略是本机解码优先且服务端不可承担视频/音频解码压力。当前链路保持：

- `PlaybackInfo` 请求显式发送 `EnableDirectPlay=true`、`EnableDirectStream=true`、`EnableTranscoding=false`。
- Electron / Web Preview 请求保留 `EnableVideoStreamCopy=true` 与 `EnableAudioStreamCopy=true`。
- Tauri 请求保留 `enable_video_stream_copy: true` 与 `enable_audio_stream_copy: true`。
- `DeviceProfile.TranscodingProfiles` 固定为空数组。
- 播放 URL 固定走 `Videos/{id}/stream?Static=true`。
- 只接受服务端明确返回 `SupportsDirectPlay=true` 或 `SupportsDirectStream=true` 的媒体源。
- 切换线路或媒体源时，无法确认本机直连/直流能力的源会被禁用或拒绝。
- 播放进度上报只允许 `DirectPlay` / `DirectStream`，不让 `Transcode` 语义进入会话状态。
- `npm.cmd run build` 前置执行 `check:local-decode`，禁止转码 URL、服务端 HLS 转码 playlist、启用转码、禁用 stream copy 或非空转码 profile 回归。

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
```

当前最新阶段已验证：

- `node --check scripts\check-local-decode-guard.mjs`
- `npm.cmd run check:local-decode`
- `npm.cmd run build`
- `git diff --check`
- 构建后播放进程残留检查

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
