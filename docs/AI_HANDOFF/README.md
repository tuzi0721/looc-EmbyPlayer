# Windows AI 接手入口

本目录是 Windows Phase 0-4 工作的 AI 接手入口。它用于记录可复现事实、阶段边界和后续动作，不替代代码、测试或仓库根目录 `HANDOVER.md`，也不要求修改根目录 `HANDOVER.md`。

## 1. 接手阅读顺序

1. 阅读 [`../WINDOWS_ROADMAP.md`](../WINDOWS_ROADMAP.md)，确认当前阶段、目标和验收门禁。
2. 阅读本文件，确认文档和并行协作约定。
3. 按“前置文档”链查找当前阶段最新且未被 `superseded` 的接手文档。
4. 阅读当前代码、测试和相关配置；旧文档只能作为线索，不能覆盖代码事实。
5. 在任何编辑前记录：

   ```powershell
   git status --short --branch
   git rev-parse HEAD
   git log -1 --oneline
   ```

6. 将接手前已有的修改和未跟踪文件登记为“非本阶段所有”，不得回退、覆盖、暂存或删除。
7. 从 [`PHASE_TEMPLATE.md`](./PHASE_TEMPLATE.md) 创建新的阶段文档，再开始实现。

## 2. 事实优先级

发生冲突时按以下顺序处理：

1. 用户在当前任务中的最新明确指令。
2. 当前代码、自动化测试、真实构建和真实运行结果。
3. 当前阶段最新有效的 AI 接手文档。
4. `docs/CURRENT_STATE.md`、`docs/PROJECT_MEMORY.md` 与相关变更记录。
5. Windows 路线图、旧计划和参考项目。

不得为了让代码“符合旧文档”而覆盖其他代理的在途改动。发现冲突时，先在自己的接手文档中记录差异、受影响文件和建议处理方式。

## 3. 文档命名与关系

阶段实例文档建议命名为：

```text
PHASE_<0-4>_<YYYY-MM-DD>_<slug>.md
```

示例：

```text
PHASE_1_2026-07-11_startup-lifecycle.md
```

约定：

- 使用四位年份和两位月份、日期；`slug` 使用小写英文与连字符。
- 每份文档必须填写“前置文档”；没有前置文档时写 `无（阶段首份）`。
- 同一阶段并行工作时，每个代理新建自己的文档，不覆盖他人的阶段文档。
- 活跃代理可以更新自己创建的文档；他人接手或纠错时应新建后继文档，并通过“前置文档”形成链。
- `PHASE_TEMPLATE.md` 只作为模板，不在其中记录具体阶段进度。
- 状态只使用 `planned`、`in_progress`、`blocked`、`accepted`、`superseded`。

可使用以下 PowerShell 命令复制模板；目标存在时命令应失败，不要使用 `-Force`：

```powershell
Copy-Item .\docs\AI_HANDOFF\PHASE_TEMPLATE.md .\docs\AI_HANDOFF\PHASE_1_2026-07-11_example.md
```

## 4. 必写内容约定

每份阶段文档必须做到：

- **基线可定位**：记录分支、完整提交 SHA、上游和接手时工作区状态。
- **所有权可区分**：明确哪些是接手前改动、哪些是本代理改动。
- **范围可审计**：列出所有实际变更文件及其目的，不写含糊的“若干文件”。
- **决策可解释**：记录选择、备选方案、理由和兼容性影响。
- **迁移可执行**：配置、数据、IPC、依赖或构建变化必须给出迁移和回退；无迁移也要写明原因。
- **验证可复现**：保留精确命令、环境、时间和 `PASS`/`FAIL`/`SKIPPED` 结果。
- **问题可继续**：未解决问题包含证据、影响、临时措施和解除条件。
- **下一步可行动**：按优先级写出文件入口、预期结果和完成判据。
- **回滚不伤及他人**：只回滚本阶段拥有的提交或文件，不使用破坏共享工作区的命令。

文档中将内容明确标记为以下三类之一：

- `事实`：已由代码、命令、日志或运行结果验证。
- `计划`：尚未实施的目标。
- `假设`：需要后续验证的判断。

不得把“看起来可行”“理论上通过”写成实际通过。

## 5. 验证记录约定

- Windows 命令优先使用 PowerShell 形式；npm 命令优先写 `npm.cmd`。
- 只记录实际执行过的命令。未执行的命令标为 `SKIPPED` 并说明原因。
- 结果至少包含退出码或关键输出摘要；失败结果不能只写“有问题”。
- 真实服务测试必须脱敏，不记录账号、密码、Token、Cookie、完整私人 URL 或完整播放 URL。
- 根据改动选择命令，不要求机械执行全部命令。常见入口包括：

  ```powershell
  npm.cmd run check:local-decode
  npm.cmd run check:no-planned-ui
  npm.cmd run check:electron-commands
  npm.cmd run check:workspace
  npm.cmd run build
  cargo check --manifest-path .\src-tauri\Cargo.toml --all-targets
  npm.cmd run electron:build
  npm.cmd run electron:dist
  git diff --check
  ```

- 打包或 smoke 产生的文件必须遵循仓库忽略和清理策略；不得删除或覆盖无法确认所有权的现有产物。

## 6. 并行代理与 Git 约定

- 默认工作区是共享的，`git status` 中不属于本任务的内容视为其他人的在途工作。
- 只编辑当前任务明确分配的文件；需要触碰重叠文件时，先记录冲突并取得协调。
- 不执行 `git reset --hard`、`git checkout -- <path>`、批量清理、他人 stash、rebase、amend 或 force push。
- 使用精确路径查看和暂存；提交前运行：

  ```powershell
  git diff --check
  git diff --cached --name-only
  ```

- 不使用无边界的 `git add .`。
- 一个提交只表达一个可验证意图，提交 SHA 必须回填到阶段文档。
- 不修改仓库根目录 `HANDOVER.md`，除非用户在未来任务中另行明确授权。

## 7. AGPL-3.0 参考约定

LinPlayer 参考项目采用 AGPL-3.0。本项目默认执行独立实现：

- 可以观察用户可见行为、功能分层、错误场景和测试思路。
- 不复制或逐行改写其源代码、测试、注释、配置、文案、布局实现、图标、图片、字体、着色器、补丁或二进制资源。
- 每份阶段文档在“参考与许可证记录”中写明参考的思想和独立实现证据。
- 如果出现任何代码或资源复用需求，先停止该部分实施并请求许可证评审与项目授权。

## 8. 交接完成条件

只有同时满足以下条件，接手文档才可标记为 `accepted`：

1. 路线图对应验收项已有结果和证据。
2. 本阶段变更文件、提交和迁移均已记录。
3. 失败或跳过项已有风险、后续负责人或明确接受结论。
4. 下一位代理可从记录的基线、命令和文件入口继续工作。
5. 回滚方法不会回退或覆盖其他代理的改动。
