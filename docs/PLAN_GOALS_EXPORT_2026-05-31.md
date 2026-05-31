# Hills Lite — 计划目标导出

> 导出时间：2026-05-31 02:28 (UTC+8)  
> 项目路径：`A:\vsc\emby-player`  
> 主要来源：`docs/PROJECT_MEMORY.md`、`docs/CURRENT_STATE.md`、`docs/ROADMAP/product-roadmap-v2.md`、`docs/ROADMAP/electron-migration.md`、`docs/ROADMAP/gap-alignment.md`

---

## 1. 产品总目标

Hills Lite 的目标是成为一个 **Emby / Jellyfin 优先、后续支持多连接器媒体源的桌面媒体中心**。

核心方向：

- 保留现有 **Hills Lite 紫色 / Violet / iOS 毛玻璃视觉语言**。
- 桌面壳逐步迁移到 **Electron + Vue 3 + TypeScript + Pinia**。
- 播放核心坚持 **mpv / libmpv-first**；HTML5 / HLS 仅作为后备路径。
- 通过连接器模型扩展媒体源：Emby、Jellyfin、Plex、本地文件、WebDAV、SMB、Alist / OpenList、云盘等。
- 在连接器边界做宽容解析，向 UI 暴露稳定内部模型。
- 继续强化桌面体验：随包 mpv、托盘、通知、遥控、下载、快捷键、协议链接、配置备份、首启引导等。

---

## 2. 当前已确认的近期待办

根据 `docs/CURRENT_STATE.md`：

> Phase 2：暂无新的已确认待办；继续按实际缺口推进可用性清理、真实联调和视觉验证。

根据 `docs/ROADMAP/gap-alignment.md`，当前唯一仍明确等待外部输入的历史差距：

### G9 — 打开闪退（P0）

目标：定位并修复双击 exe 后窗口闪退问题。

下一步：

1. 用户运行最新 exe。
2. 提供 `%LOCALAPPDATA%/EmbyPlayer/crash.log` 全文。
3. 根据 panic 位置修复，常见方向包括 store 反序列化、SMTC、global-shortcut 等。

验收：

- exe 可启动。
- Sidebar 可见。
- 没有新的 crash.log 崩溃条目。

---

## 3. 架构迁移目标

### 3.1 目标技术栈

- Electron main process：桌面壳、文件系统、对话框、快捷键、通知、托盘、协议链接、可选 native helper。
- Vue 3 + TypeScript + Pinia：UI 与状态管理。
- mpv IPC：当前默认播放核心。
- libmpv D3D11 / composition：后续方向。
- HTML5 / HLS：有限环境下的 fallback，不作为主路径。

### 3.2 Electron 迁移阶段

1. **Platform bridge**：所有 renderer `invoke`、事件监听、平台检测、文件选择走 `src/platform`。
2. **Electron backend**：设置、账号、服务器、通知、下载等迁移到 Electron main services。
3. **TypeScript Emby/Jellyfin client**：把 HTTP client 与宽容响应归一化迁到 TypeScript 边界。
4. **mpv-first player**：Electron 默认使用 mpv IPC；后续评估原生窗口 / libmpv 嵌入。
5. **Retire Tauri**：当 Electron 覆盖登录、媒体库、设置、播放、下载、通知、快捷键和发布打包后，默认产品移除 Tauri / Rust runtime。

---

## 4. Roadmap 里程碑

### M0 — 稳定播放与迁移基础

目标：

- 打包后 UI 不黑屏。
- 不产生 mpv 进程风暴。
- 播放请求有单一路径和串行化保护。
- 播放页保留海报 / 背景加载态。
- Emby / Jellyfin 直连流可播放。

当前状态：大部分基础能力已落地；Electron 打包、mpv 随包、播放队列串行化和多项完整性检查已接入。

后续重点：真实播放场景回归、失败恢复验证、更多 smoke test 自动化。

### M1 — 连接器基础

目标：

- Emby / Jellyfin 一等支持：首页 Hero、媒体库、收藏、历史、搜索、季集、播放线路、宽容响应解析。
- 启动期线路测活、连接器图标 / 头像 fallback、图片缓存。
- 为 Plex、私有服务与文件源准备统一 connector contract。

当前状态：Emby / Jellyfin 主路径已大量实现；统一 connector contract 与更多源仍是后续目标。

后续重点：Plex / 文件服务连接器抽象、跨源搜索 / 历史 / 收藏。

### M2 — 播放器基础

目标：

- 当前以 mpv IPC 为主。
- 后续推进 libmpv D3D11 / composition 嵌入。
- 保留独立窗口、小窗模式作为显式播放模式。
- 完善播放列表、章节、跳片头片尾、统计、截图、置顶、副屏遮黑、宽度自适应控制栏等。

当前状态：mpv IPC、章节、跳片头片尾、统计、截图、置顶、副屏遮黑、宽度收纳等均已有实现；libmpv / composition 仍是后续方向。

后续重点：composition 真实启用验证、最小窗口约束、播放线路会话级切换、更多真实播放人工/自动化验证。

### M3 — PDP 与元数据体验

目标：

- 季 / 集、媒体信息、演职人员、合集、艺术图、外部链接、相似内容、附加内容、工作室导航。
- Douban 评分、Trakt 同步。
- 紧凑窗口、超宽屏、2K / 4K、高 DPI 下保持响应式桌面布局。

当前状态：季集、演职人员、相似内容、附加内容、外部链接、工作室导航、Trakt 基础设置等已实现；Douban 评分与真实 Trakt OAuth / 同步仍待推进。

后续重点：Douban / Trakt 深度接入、合集与人物导航增强、真实大屏 / 高 DPI 视觉验证。

### M4 — 弹幕与字幕

目标：

- DanDanPlay、misaka、服务端弹幕、Bilibili 登录、外部 XML。
- 弹幕热度条、重复合并、速度同步、避让字幕、Provider User-Agent。
- 在线字幕搜索、ASS 样式、字幕堆叠、截图安全重置。

当前状态：DanDanPlay、弹幕菜单、重复合并、热度条、避让字幕、User-Agent、字幕样式等已实现；misaka / Bilibili / 外部 XML / 在线字幕搜索仍是后续目标。

后续重点：多弹幕源接入、在线字幕搜索、字幕堆叠策略和真实视频场景验证。

### M5 — AI 字幕与画质增强

目标：

- Whisper 本地 / API 字幕、CUDA / Vulkan 支持。
- 云端 / 本地 AI 翻译、多 worker 异步流水线、成本保护节流。
- DTW token timestamps、有限预读窗口。
- NVIDIA RTX VSR / TrueHDR、AMD FSR、GLSL shaders、RIFE、Auto HDR、HDR 显示跟踪、画面模式。

当前状态：播放器已有部分画面模式与 Windows HDR 入口；Whisper / AI 翻译 / VSR / TrueHDR / FSR / RIFE 等仍是未来增强方向。

后续重点：先建立能力检测与设置模型，再逐步接入具体后端。

### M6 — 桌面生态

目标：

- 配置导入 / 导出。
- `rodelplayer://` 协议链接。
- 第三方应用互通。
- 托盘、播放期间防息屏、快捷键自定义和解绑。
- 繁体中文 / 英文 localization。
- 首启引导。

当前状态：配置备份 / 还原、协议入口、托盘、防息屏、首启引导、快捷键持久化 / 解绑等已实现；多语言本地化与更广泛第三方互通仍是后续目标。

后续重点：localization、第三方 app interop、更多桌面平台差异验证。

---

## 5. 功能线目标汇总

### 在线媒体

- Emby / Jellyfin / Plex。
- 首页 Hero、媒体库、收藏、历史、聚合搜索 / 收藏 / 历史。
- 跨源搜索 / 历史。
- 备用线路、私有服务、比特率排序。

### 文件服务

- 本地文件、WebDAV、SMB、Alist / OpenList、115 云盘。
- 浏览、收藏、历史。
- 自动关联字幕 / 弹幕。

### PDP

- 季集、媒体信息、演职人员、合集、艺术图。
- 外部链接、相似内容、附加内容。
- Douban 评分、Trakt 同步、工作室详情、制作公司单行溢出 popover。

### 播放器

- mpv IPC 当前主路径。
- libmpv D3D11 / composition、独立窗口、小窗后续推进。
- 手势、长按倍速、章节、跳片头片尾、播放列表、统计、截图、置顶、副屏遮黑。
- 会话级播放线路切换、自动裁黑、切轨保缓存、宽度自适应控制栏、最小窗口约束。
- 外部 mpv / CapyPlayer 互通通过外部播放器支持明确保留。

### 弹幕

- DanDanPlay、misaka、服务端弹幕、Bilibili 登录、外部 XML。
- PDP 自动匹配剧集。
- 热度条、重复合并 `×N`、速度同步、避让字幕、Provider UA、菜单独立数量显示。

### 字幕与 AI

- assrt 在线字幕搜索。
- ASS 样式、字幕堆叠、字幕自动避让、截图时避让重置。
- Whisper CUDA / Vulkan / 本地 / API。
- 云端 / 本地 AI 翻译 API、多 worker 异步管线、成本保护、DTW 时间戳、有限预读。

### 画质增强与 HDR

- NVIDIA RTX VSR、NVIDIA TrueHDR、AMD FSR、GLSL shaders、RIFE 插帧。
- 内置 Auto HDR、八种画面模式、HDR 三态切换、target peak override、系统 HDR 自动化、显示变化跟踪。
- NVIDIA 开关默认可见，但 GPU 或 D3D11 硬件路径不可用时应自动禁用并给出明确提示。

### 桌面生态

- 配置导入 / 导出。
- `rodelplayer://` 协议。
- 第三方 app 互通。
- 托盘、播放防锁屏、Visor wheel acceleration。
- 繁中 / 英文 localization。
- 自定义快捷键、快捷键解绑、首启引导。

---

## 6. 已完成差距与约束

已完成或基本完成：

- G1：用户可见品牌统一为 Hills Lite。
- G2：主导航含收藏、历史、聚合视界、下载、通知、遥控等入口。
- G3：MPV IPC 使用命名管道 / 套接字模型。
- G4：mpv 固定随包，来源为 `src-tauri/resources/mpv`。
- G5：Tauri 本地 release 只产 exe。
- G6 / G7：文档体系与变更日志持续维护。
- G8：Player 返回时 fire-and-forget stop，卸载清理并行化。
- G10：本机 mpv 检测横幅和 detectMpv 路径已移除。

重要约束：

- 不恢复本机 mpv 检测、路径选择或构建期下载 mpv。
- 不用浏览器 HLS 替代 mpv 主路径。
- 保留 Hills Lite 当前 UI 风格，除非明确安排重设计。
- 每次代码改动后必须新增 `docs/CHANGE_LOG/<YYYY-MM-DD-HHmm>-<short-title>.md` 并同步 `CURRENT_STATE.md`。
- 真实状态以 `CURRENT_STATE.md` 与最新 `CHANGE_LOG/` 为准。

---

## 7. 建议下一步执行顺序

1. 如仍存在启动闪退：先处理 **G9**，需要最新 `crash.log`。
2. 做真实可用性验证：播放器、下载、通知、遥控、托盘、配置备份、Electron portable、Tauri release。
3. 补齐真实场景人工验证缺口：字幕样式、弹幕避让、截图、章节、切轨、全屏副屏遮黑、控制栏 resize、Stats 浮层。
4. 推进连接器抽象：为 Plex / 文件服务 / WebDAV / SMB / Alist / 云盘统一模型做设计。
5. 推进 M4/M5 长期能力：多弹幕源、在线字幕、Whisper / AI 翻译、HDR / VSR / shader / RIFE。
6. 推进 M6 桌面生态：多语言、第三方 app interop、跨平台行为验证。