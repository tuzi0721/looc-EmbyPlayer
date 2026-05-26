# Hills Lite — 工程与协作规范

本文件是 [`PROJECT_MEMORY.md`](./PROJECT_MEMORY.md) 的细则扩展。冲突时以 **寸止确认的用户意图** 为准。

---

## 1. 会话启动检查清单（AI）

1. MCP `ji` → `action=回忆`, `project_path=a:\vsc\emby-player`（或实际 git 根）
2. 阅读 `docs/PROJECT_MEMORY.md`
3. 阅读 `docs/CURRENT_STATE.md`
4. 阅读 `docs/CHANGE_LOG/` 下**最新一条**日志
5. 若任务涉及差距表（G1–G9），阅读 `docs/ROADMAP/gap-alignment.md`

---

## 2. 变更流程（每次改代码）

```
意图确认（寸止，若有多方案）
    ↓
改代码（最小 diff）
    ↓
写 CHANGE_LOG/<YYYY-MM-DD-HHmm>-<title>.md
    ↓
更新 CURRENT_STATE.md 相关段落
    ↓
寸止汇报 + 请求反馈（完成前必须）
```

### 2.1 CHANGE_LOG 模板

```markdown
# <标题>

- **时间**：YYYY-MM-DD HH:mm (UTC+8)
- **动机**：…
- **修改文件**：
  - `path` — …
- **风险**：…
- **回滚**：…
- **验证步骤**：…
- **结果**：…（构建/运行结论）
```

---

## 3. 构建规范

| 项 | 规范值 | 配置文件 |
|---|---|---|
| 开发 | `npm run tauri:dev` | package.json |
| 发布构建 | `npm run tauri:build` | |
| 目标产物 | **仅** `emby-player.exe` | 目标：`tauri.conf.json` → `bundle.active: false` 或 `targets: []` |
| Release profile | `panic = "abort"`, LTO, strip | `Cargo.toml` [profile.release] |

> **当前状态**：`tauri.conf.json` 已设置 `bundle.active: false` 与 `targets: []`，发布验证以 `src-tauri/target/release/emby-player.exe` 为主。

---

## 4. 命名与品牌

| 场景 | 规范（当前） | 备注 |
|---|---|---|
| 窗口标题 / productName | Hills Lite | 与 `src-tauri/tauri.conf.json` 对齐 |
| Sidebar 品牌 | Hills Lite | `src/components/common/AppSidebar.vue` |
| npm 包名 | 可保持 `emby-player`（历史命名） | 避免无关范围大规模 rename |
| Rust crate | `emby-player` / `emby_player_lib` | 与 Cargo 包名保持一致 |
| 用户可见文案 | 统一 Hills Lite | 历史审计中的旧文案仅作快照记录 |

**Rename 原则**：一次 PR/任务只做品牌字符串替换 + tauri.conf + index.html，避免与功能改动混杂。

---

## 5. UI 规范

- Sidebar 宽度 CSS 变量：`--sidebar-w: 240px`（`src/styles/theme.css`）
- 弹窗：必须 `<Teleport to="body">`
- 添加服务器：无 UA 输入；后端 `userAgent: null`
- 路由默认：`/` → `/home`
- 全屏页（播放器）：`meta.fullscreen: true`，隐藏 Sidebar

---

## 6. 后端规范

- 错误类型：统一 `AppError` / `AppResult`
- 持久化：仅通过 `ConfigStore`，键名常量定义在 `config/store.rs`
- 后台任务：`AppState::spawn_background_workers` 统一启动
- 日志：`tracing` + 可选 `RUST_LOG=emby_player=debug,info`
- 崩溃：`%LOCALAPPDATA%/EmbyPlayer/crash.log`（`lib.rs` panic hook）

---

## 7. MPV 规范

| 模式 | Feature | 说明 |
|---|---|---|
| IPC（默认） | `mpv-ipc` |  spawn 外部 mpv 进程 |
| Embedded | `mpv-embedded` | libmpv2，Windows 子窗口 |

**当前实现**：IPC 使用 `--input-ipc-server=<pipe/socket>`（Windows 命名管道：`\\.\pipe\hills-lite-mpv-{uuid}`）；`ensure_started` 会在 mpv 进程死亡后自动重启连接。

**检测与引导**：后端已实现 `detect_mpv` / `open_external`，前端 `MpvBanner` 已在 `App.vue` 挂载用于缺失提示与路径选择。

---

## 8. 测试与运行

- AI **允许**编译、运行、测试（用户已放开规则）
- 自动化测试脚本：**仅用户明确要求时**添加
- 网络类问题：先 `curl <server>/System/Info/Public` 区分环境 vs 代码

---

## 9. Git / PR

- 不主动 commit，除非用户要求
- 不 force push main
- PR 用 `gh`，遵循用户 create-pull-requests 规则

---

## 10. 禁止事项

- 跳过 CHANGE_LOG 直接改代码（除纯文档 bootstrap）
- 未寸止确认就切换品牌/构建策略/MPV 架构
- 编造 CURRENT_STATE 内容（必须可追溯到文件/配置）
