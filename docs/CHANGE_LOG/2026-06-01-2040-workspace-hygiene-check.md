# 工作区卫生检查

## 背景

用户要求继续清理项目里的无关代码和无关文件。前两轮已经把当前状态和项目指导文档从旧历史里拆出来，但工作区是否又出现临时目录、旧 Git 目录或散落日志仍靠人工 `git status --ignored` 判断，容易回退。

## 变更

- 新增 `scripts/check-workspace-hygiene.mjs`，读取 `git status --short --ignored`。
- 只允许 `.electron-user-data/`、`.vscode/`、`dist/`、`node_modules/`、`release-electron/` 与 `src-tauri/target/` 这些运行/构建目录。
- 对意外未跟踪路径或意外忽略路径报错。
- 新增 `npm.cmd run check:workspace` 入口。
- `docs/CURRENT_STATE.md` 同步记录该检查。

## 验证

- 通过：`node --check scripts\check-workspace-hygiene.mjs`
- 通过：`npm.cmd run check:workspace`
- 通过：`npm.cmd run build`
- 通过：`git diff --check`
- 通过：构建后未发现 `mpv.exe`、`electron_mpv_host.exe` 或 `Hills Lite` 残留进程。

## 风险

- 该检查不阻止已跟踪文件的正常修改；提交前仍需用 `git status --short --branch` 复核实际 diff。
