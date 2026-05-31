# Hills Lite — 项目记忆主索引

> **新会话必读**：AI 在动手改代码前，必须先读本文件 + [`CURRENT_STATE.md`](./CURRENT_STATE.md) + 最近一条 [`CHANGE_LOG/`](./CHANGE_LOG/) 日志。  
> 本文件 = 长期意图、规范、决策；`CURRENT_STATE.md` = 磁盘上代码/配置的真实快照。

---

## 1. 产品定位

| 项 | 内容 |
|---|---|
| **对外品牌（目标）** | **Hills Lite**（紫色 Violet 主题） |
| **仓库 / 包名** | `emby-player`（历史命名，尚未全面改名） |
| **类型** | Emby / Jellyfin 桌面客户端 |
| **播放内核** | MPV（默认 IPC；可选 embedded feature） |
| **UI** | iOS 毛玻璃风；左侧常驻 Sidebar + 主内容区 |

### 1.1 UI 主框架（不可违背）

- 启动后**直接进入首页** `/home`，不做额外引导页。
- **左侧 Sidebar**（自上而下）：
  - 品牌名
  - 主导航：首页 / 收藏 / 历史 / 聚合视界 / 下载 / 通知 / 遥控
  - **服务器**列表 + 齿轮「隐藏服务器」
  - 「＋ 添加服务器」
  - 底部 关于 Hills Lite / 添加服务器 / 设置
- **设置页**：左分类 + 右面板二级布局。
- **添加服务器**：不含自定义 UA 字段；弹窗须 `Teleport to="body"` 防裁切。
- **窗口**：Windows 上 `transparent: false`，不用 acrylic（防拖拽卡顿）。

### 1.2 功能清单（已实现 / 规划中）

| 模块 | 状态 | 备注 |
|---|---|---|
| 登录 / 多线路 / 竞赛 / 测活 / 保号 | ✅ 已实现 | |
| MPV 播放 + 字幕 + 弹幕 | ✅ 已实现 | IPC 使用命名管道/套接字；mpv 固定随包 |
| 下载 / 伪装下载 / 边看边下 | ✅ 已实现 | |
| 通知中心 + 托盘 | ✅ 已实现 | |
| 远程控制 / EmbySocket | ✅ 已实现 | |
| 虚拟列表 / 海报懒加载 | ✅ 已实现 | |
| 快捷键 + Windows SMTC | ✅ 已实现 | |
| 收藏页 / 历史 / 聚合视界 / 工具入口 | ✅ 已实现 | 侧边栏可直接进入 |
| MPV 内置打包 | ✅ 已实现 | `src-tauri/resources/mpv` 为唯一内置来源；Electron 打包后有完整性检查 |
| 品牌统一 Hills Lite | ✅ 当前用户可见壳层已统一 | 包名 / crate 名保留历史命名 |

---

## 2. 技术栈与环境（以仓库 manifest 为准）

> 以下版本来自 `package.json` / `Cargo.toml`，**不代表**本机已安装版本。本机 Node/Rust 版本若与下表冲突，以本机 `node -v` / `rustc -V` 为准，不确定时 **寸止询问用户**。

| 层 | 技术 | 仓库声明版本 |
|---|---|---|
| 桌面壳 | Tauri | 2.x（`@tauri-apps/cli ^2.1.0`，Rust `tauri = "2"`） |
| 前端 | Vue | ^3.5.13 |
| 前端 | Vite | ^5.4.11 |
| 前端 | TypeScript | ^5.6.3 |
| 前端 | Pinia / Vue Router | ^2.2.6 / ^4.4.5 |
| 后端 | Rust edition | 2021，`rust-version = 1.77` |
| 异步 | tokio | 1.41 |
| HTTP | reqwest | 0.12 |
| WS | tokio-tungstenite | 0.24 |
| MPV | 外部进程 IPC | 默认 feature `mpv-ipc` |
| MPV | libmpv 嵌入 | 可选 feature `mpv-embedded` + libmpv2 4 |

### 2.1 构建与产物策略（规范）

| 规则 | 目标 | 当前代码 |
|---|---|---|
| 本地 Tauri release | **只产出 exe**，不打 msi/nsis | ✅ `tauri.conf.json` 为 `bundle.active: false`, `targets: []` |
| 构建命令 | `npm run tauri:build` | |
| 产物路径 | `src-tauri/target/release/emby-player.exe` | |
| Electron unpacked | `npm.cmd run electron:build` | ✅ `release-electron/win-unpacked/Hills Lite.exe`，随包 `resources/mpv` |
| AI 可编译/运行/测试 | ✅ 允许 | |
| 总结性 Markdown | ✅ 允许（本 docs 体系） | |
| 测试脚本 | 仅用户明确要求时编写 | |

### 2.2 持久化与诊断

| 路径 | 用途 |
|---|---|
| `%APPDATA%/app.embyplayer/config.json` | tauri-plugin-store 主配置 |
| `%LOCALAPPDATA%/EmbyPlayer/crash.log` | Rust panic / tauri::run 失败日志 |

---

## 3. AI 协作规范

### 3.1 寸止（MCP `zhi`）

- 需求不明确、多方案、策略变更、任务完成前 → **必须**用寸止询问，禁止自作主张或直接结束。
- 技术路线/环境版本超出认知 → **必须**寸止询问。

### 3.2 记忆（MCP `ji`）

- 会话开始：`action=回忆`, `project_path=<git 根>`
- 用户说「请记住：」→ 总结后 `action=记忆`, `category=rule|preference|pattern|context`

### 3.3 代码搜索

- 优先 MCP `sou`；不可用则用 workspace Grep/Glob。

### 3.4 变更日志（强制）

每次代码改动后 **必须** 新增：

```
docs/CHANGE_LOG/<YYYY-MM-DD-HHmm>-<short-title>.md
```

内容须含：动机、修改文件及要点、风险、回滚、验证步骤、结果。

并同步更新 [`CURRENT_STATE.md`](./CURRENT_STATE.md)。

---

## 4. 记忆 vs 代码 — 差距表（2026-05-25 审计）

| # | 记忆 / 规范目标 | 代码现状 | 优先级 |
|---|---|---|---|
| G1 | 品牌 **Hills Lite** | ✅ 用户可见壳层已统一；包名/crate 名保留历史命名 | P2 |
| G2 | 主导航含收藏/历史/聚合/工具入口 | ✅ router 与 Sidebar 已接入 | P2 |
| G3 | MPV IPC 命名管道 `--input-ipc-server` | ✅ Tauri IPC 与 Electron mpv 后端均使用随包 mpv 模型 | P1 |
| G4 | 内置 `resources/mpv/mpv.exe` + build.rs 复制 | ✅ `src-tauri/resources/mpv` 为唯一来源；不再本机检测或构建期下载 | P1 |
| G5 | 本地构建只产 exe | ✅ `bundle.active: false`, `targets: []` | P2 |
| G6 | `docs/CHANGE_LOG/` 持续维护 | ✅ 已持续维护 | P0 |
| G7 | `PROJECT_MEMORY.md` 主索引 | **本次新建** | P0 ✅ |
| G8 | Player `back()` fire-and-forget stop | ✅ 已完成，卸载清理也已并行化 | P3 |
| G9 | 打开闪退 | 已加 `crash.log`；根因待日志 | P0 |
| G10 | MpvBanner + detectMpv | ✅ 已按内置 mpv 模型移除，不再恢复本机检测提示 | P2 |
| G11 | 收藏功能 | 无 set_favorite；Detail 无 ♥；Favorites 只读 | P2 |
| G12 | hardwareDecoding 等 | 设置仅存，未传给 mpv | P3 |
| G13 | 全量审计后再改代码 | ✅ [`AUDIT_FULL_2026-05-25.md`](./AUDIT_FULL_2026-05-25.md) | — |

> 本表源自 2026-05-25 审计，已在 2026-05-30 按当前代码校正；真实状态仍以 `CURRENT_STATE.md` 与最新 `CHANGE_LOG/` 为准。

---

## 5. 文档地图

```
docs/
├── PROJECT_MEMORY.md          ← 本文件（主索引，新会话先读）
├── CURRENT_STATE.md           ← 代码/配置真实快照
├── STANDARDS.md               ← 协作与工程规范细则
├── CHANGE_LOG/                ← 每次改动的详细日志
├── ROADMAP/                   ← 专项任务与待办
│   └── gap-alignment.md       ← 差距表 G1–G13 的修复计划
├── AUDIT_FULL_2026-05-25.md   ← 全量代码审计（改代码前必读）
├── NOTIFICATION_CENTER_PLAN.md  ← 通知中心设计（已完成，归档参考）
└── REMOTE_PERF_HOTKEYS_PLAN.md  ← 遥控/性能/快捷键设计（已完成，归档参考）
```

---

## 6. 决策历史（摘要）

| 日期 | 决策 |
|---|---|
| 2026-05 | 选型 Tauri 2 + Vue 3 + MPV IPC |
| 2026-05 | Sidebar 重构：首页默认、服务器隐藏、设置分栏 |
| 2026-05 | Windows 关透明 + 去 acrylic 修拖拽 |
| 2026-05 | 添加 crash.log 诊断启动闪退 |
| 2026-05-25 | 建立 docs 体系；审计发现 CURRENT_STATE 与代码严重偏离 |

---

## 7. 相关链接

- 差距修复计划：[`ROADMAP/gap-alignment.md`](./ROADMAP/gap-alignment.md)
- 最新改动：[`CHANGE_LOG/`](./CHANGE_LOG/) 目录下时间最新文件
