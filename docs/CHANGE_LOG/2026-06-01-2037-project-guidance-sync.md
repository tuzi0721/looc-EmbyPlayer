# 项目记忆与规范同步

## 背景

`PROJECT_MEMORY.md` 和 `STANDARDS.md` 会被后续会话当成执行入口读取，但它们仍保留早期主导航、Tauri 主线、协作流程和功能边界描述。直接删除会断开现有引用，继续保留旧内容又会把后续维护带回旧判断。

## 变更

- 重写 `docs/PROJECT_MEMORY.md`，保留产品目标、当前架构、本机解码硬约束、验证命令、文档地图和清理边界。
- 重写 `docs/STANDARDS.md`，同步当前阶段必须写日志、更新状态、验证、提交、推送和远端确认的流程。
- `docs/CURRENT_STATE.md` 记录项目指导文档已同步，后续判断当前事实以 `CURRENT_STATE.md` 与最新提交为准。

## 验证

- 通过：`npm.cmd run check:local-decode`
- 通过：`npm.cmd run check:no-planned-ui`
- 通过：`npm.cmd run build`
- 通过：`git diff --check`
- 通过：旧导航、旧 UA 规则、旧 Git 规则、旧 Tauri 主构建命令和旧 MCP 流程关键词在 `PROJECT_MEMORY.md` / `STANDARDS.md` 中无命中。
- 通过：构建后未发现 `mpv.exe`、`electron_mpv_host.exe` 或 `Hills Lite` 残留进程。

## 风险

- 本阶段只改文档，不改运行时代码；早期审计和计划文档仍保留为归档参考。
