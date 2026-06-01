# Hills Lite 项目记忆主索引

> 当前用途：给后续维护者和 AI 一个短、准、当前的项目入口。
>
> 新会话先读：[`CURRENT_STATE.md`](./CURRENT_STATE.md) → 本文件 → [`STANDARDS.md`](./STANDARDS.md) → `CHANGE_LOG/` 里时间最新的日志。

---

## 1. 产品目标

Hills Lite 是 Emby / Jellyfin 优先的桌面媒体客户端，当前主运行壳为 Electron + Vue 3 + TypeScript，Tauri 路径保留但不是发布主线。产品体验要像真实桌面播放器，而不是 Web 预览壳或功能清单页。

核心方向：

- 首页直接呈现媒体库内容，巨幕使用真实 Backdrop、Primary 海报、简介和播放状态。
- 播放器内嵌在应用窗口内，使用应用随包 mpv 作为默认播放核心。
- 添加服务器流程要包含账号、密码、线路地址和任意端口，并自动识别 Emby / Jellyfin。
- 主界面只放高频导航；下载、通知、遥控等工具入口集中在设置页。
- 设置页只展示当前能触发或能配置的能力，不能放不可使用的产品入口。
- 文件源以本地文件、本地文件夹、WebDAV、Alist / OpenList 为当前可用面。

---

## 2. 硬约束

- 每个小阶段完成后必须写 `docs/CHANGE_LOG/<YYYY-MM-DD-HHmm>-<slug>.md`，同步更新 `docs/CURRENT_STATE.md`。
- 当前用户要求阶段完成后提交、推送并确认远端 `main` 指针，然后继续下一轮。
- 不把测试账号、密码、token、完整真实线路 URL 或完整播放 URL 写进仓库文档。
- 不伪造成功：浏览器路由不可用、真实服务器为空、接口返回 403、视觉没有目检，都要如实记录。
- 播放必须坚持本机解码策略；宁可失败提示，也不让 Emby/Jellyfin 服务端承担视频/音频解码或转码压力。
- mpv 只使用应用随包资源；不要恢复 PATH/system mpv、下载引导、vendor fallback 或用户 mpv 路径选择。
- 不恢复不能使用的 UI 入口。`npm.cmd run build` 已执行 `check:no-planned-ui`，阻止占位文案回到用户界面。

---

## 3. 当前架构

| 层 | 当前事实 |
|---|---|
| 桌面壳 | Electron 主线；Tauri 保留可运行路径 |
| 前端 | Vue 3 + TypeScript + Pinia + Vue Router |
| 播放 | 随包 mpv IPC / 内嵌宿主；HTML video 仅用于 Web Preview 等有限路径 |
| 后端 | Electron main services + Tauri Rust commands 双路径并存 |
| 设置/账号 | Electron JSON store；Tauri ConfigStore；Web Preview 使用浏览器状态 |
| 打包 | Electron unpacked / portable；Tauri release exe 仍可构建 |

重要路径：

- Electron unpacked：`release-electron\win-unpacked\Hills Lite.exe`
- Electron portable：`release-electron\Hills Lite 0.1.0.exe`
- Tauri release：`src-tauri\target\release\emby-player.exe`
- 随包 mpv 源：`src-tauri\resources\mpv`
- Electron 随包 mpv：`release-electron\win-unpacked\resources\mpv`

---

## 4. 本机解码策略

所有播放源协商都必须保持 Direct Play / Direct Stream only：

- `EnableDirectPlay=true`
- `EnableDirectStream=true`
- `EnableTranscoding=false`
- `EnableVideoStreamCopy=true`
- `EnableAudioStreamCopy=true`
- Tauri 对应字段同样必须为 direct / stream copy 模式
- `TranscodingProfiles` 必须为空
- 播放 URL 必须走静态流 `Static=true`
- 只接受明确支持本机直连或本机直流的媒体源
- 进度上报只允许 `DirectPlay` / `DirectStream`

门禁：`npm.cmd run check:local-decode`。

Direct Stream 在本项目中只能表示本机解码前提下的静态流 / stream copy，不得退化成服务端解码、转码或 HLS 转码 playlist。

---

## 5. 验证命令

优先使用 Windows 上稳定的 `npm.cmd`：

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
node scripts\smoke-electron-embedded-local.mjs
node scripts\smoke-electron-home-hero.mjs
```

网络 / GitHub 命令可能需要授权运行。推送后用 `git ls-remote origin refs/heads/main` 确认远端。

---

## 6. 文档地图

| 文档 | 当前用途 |
|---|---|
| `docs/CURRENT_STATE.md` | 当前事实快照 |
| `docs/STANDARDS.md` | 当前工程和协作规范 |
| `docs/CHANGE_LOG/` | 每个阶段的完整历史 |
| `docs/UI_REFERENCE_HILLS_LITE.md` | UI 规格参考 |
| `docs/ROADMAP/*.md` | 产品和迁移路线参考 |
| `docs/AUDIT_FULL_2026-05-25.md` | 早期审计归档，不代表当前事实 |
| `docs/NOTIFICATION_CENTER_PLAN.md` | 通知中心归档设计，代码注释仍引用 |
| `docs/REMOTE_PERF_HOTKEYS_PLAN.md` | 遥控/性能/快捷键归档设计，代码注释仍引用 |
| `docs/PLAN_GOALS_EXPORT_2026-05-31.md` | 2026-05-31 目标导出归档 |

判断当前状态时，以 `CURRENT_STATE.md` 和最新提交为准；归档文档只用于追溯来路。

---

## 7. 当前清理边界

`git status --short --ignored` 只应出现这些忽略目录：

- `.electron-user-data/`
- `.vscode/`
- `dist/`
- `node_modules/`
- `release-electron/`
- `src-tauri/target/`

不要删除 `.electron-user-data/`，里面可能含当前测试服务器配置或登录态。删除构建产物前先确认本阶段是否需要保留 exe 位置给用户。
