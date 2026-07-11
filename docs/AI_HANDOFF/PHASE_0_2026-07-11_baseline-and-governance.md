# Phase 0：基线与可持续交接

> 状态：`in_progress`
> 负责人/代理：`Codex 019f5194-94d3-7fa0-b42d-98f9bf523215`
> 创建日期：`2026-07-11`
> 最后更新：`2026-07-11 23:00 +08:00`
> 前置文档：`无（阶段首份）`
> 后继文档：`暂无`

## 0. 本次范围

目标：保存开始本轮迭代前已有的 Windows 播放器改动；建立 Windows-only 路线图、AI 接手入口、阶段模板和独立 Git 分支；阻止参考源码及快捷方式误提交。

不包含：产品行为/UI 修改、Phase 1 安全实现、跨平台开发、修改根目录既有 `HANDOVER.md` 内容。

## 1. 基线事实

- 仓库：`https://github.com/tuzi0721/looc-EmbyPlayer`
- 本地路径：`E:\vsc\emby-player`
- 分支：`codex/windows-security-foundation`
- 开始本轮前提交：`ad6357df03e1db722dfaeb7936e3cbc096df5595`
- 既有工作快照：`b4a10439c5176c66fd9c2b4cf07da8bb24fed5b0`
- 快照主题：`chore: checkpoint existing Windows player work`
- 快照保存了接手时已有的 42 个变更文件；未包含 `参考/` 和 `.lnk`。
- `参考/` 约 1330 个文件、621 MB，只作本地 AGPL-3.0 行为/设计参考。
- 主交付链：Electron + 自研 Qt/QML/libmpv；Tauri/Rust Windows 链保持兼容，但不要求每阶段同步重构。

## 2. 环境

- Windows 10 专业版 `10.0.19045`，x64。
- Node.js `v22.23.1`；npm `10.9.8`。
- Git `2.54.0.windows.1`。
- GitHub CLI：开始时缺失；已通过 winget 安装官方 `gh 2.96.0`。
- Cargo：当前 PowerShell PATH 中不可用。

## 3. Phase 0 变更文件

| 路径 | 目的 |
| --- | --- |
| `.gitignore` | 排除 `参考/` 和 `*.lnk` |
| `docs/WINDOWS_ROADMAP.md` | 固化 Windows Phase 0-4 顺序 |
| `docs/AI_HANDOFF/README.md` | 下一位 AI 的接手入口与协作规则 |
| `docs/AI_HANDOFF/PHASE_TEMPLATE.md` | 每阶段迁移、验证、问题、下一步和回滚模板 |
| `docs/AI_HANDOFF/PHASE_0_2026-07-11_baseline-and-governance.md` | 本阶段真实快照 |

## 4. 设计决策

### D-001：先提交已有工作快照

接手时已有 38 个修改的跟踪文件和多个有效未跟踪源文件。先创建 checkpoint，使 Phase 1 只产生新的安全差异，并可回退到本轮起点。

### D-002：参考项目不进入 Git

参考目录体积大且采用 AGPL-3.0。通过 `.gitignore` 排除整个 `/参考/`，只记录独立实现的设计决策。本阶段无任何代码或资源复用。

### D-003：独立分支

使用 `codex/windows-security-foundation`，不直接继续修改 `main`。

## 5. 验证结果

| 命令 | 结果 | 退出码 | 摘要 |
| --- | --- | --- | --- |
| `npm run build` | `PASS` | `0` | local-decode、no-planned-ui、vue-tsc、Vite production build 通过；仅有 chunk 大小警告 |
| `npm run check:electron-commands` | `PASS` | `0` | 121 renderer commands、117 Electron handlers、5 explicit no-op |
| `cargo test --manifest-path src-tauri/Cargo.toml` | `SKIPPED` | `1` | PATH 找不到 `cargo`，不是测试失败 |
| `git diff --check`（开始前） | `PASS` | `0` | 无空白错误；只有 LF→CRLF 提示 |
| 产品 smoke | `SKIPPED` | - | Phase 0 不改变产品行为 |

## 6. 未解决问题

| ID | 严重度 | 问题 | 下一步 |
| --- | --- | --- | --- |
| P0-U-001 | 中 | Cargo 不在 PATH | 涉及 Tauri 的阶段查找或安装 Rust 工具链 |
| P0-U-002 | 中 | 尚未确认 GitHub 认证/推送 | 本阶段提交后运行 `gh auth status` 和 `git push -u origin ...` |
| P0-U-003 | 低 | Vite chunk 超过 500 kB | 后续架构阶段处理 |

## 7. 下一步

1. 提交并推送 Phase 0 文档。
2. Phase 1 实现 Electron Windows 凭据安全：`electron/backend/store.mjs`、新的安全凭据模块、`electron/main.mjs` 及必要 renderer 适配。
3. 对 BrowserWindow 安全开关逐项验证，不盲目一次性收紧。

## 8. 回滚

- 已有工作快照：`b4a10439c5176c66fd9c2b4cf07da8bb24fed5b0`。
- Phase 0 只拥有本文列出的文档与 `.gitignore`。
- 已推送后使用 `git revert <Phase 0 提交>`；不得使用 `git reset --hard`。

## 9. 许可证记录

- LinPlayer：AGPL-3.0。
- 只参考阶段化工程和问题拆分思想。
- 无源代码、测试、注释、配置、文案、布局、图标或其他资源复用。

## 10. 提交快照

| SHA | 提交主题 | 已推送 |
| --- | --- | --- |
| `b4a10439c5176c66fd9c2b4cf07da8bb24fed5b0` | `chore: checkpoint existing Windows player work` | 否，待本阶段一并推送 |
| `待提交` | `docs(win-p0): establish Windows roadmap and AI handoff` | 否 |

当前状态：`in_progress`。文档提交及 GitHub 推送完成后改为 `accepted`。即使会话中断，下一位 AI 可从本文、路线图和 checkpoint 继续。