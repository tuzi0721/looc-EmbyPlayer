# 2026-06-01 18:34 生成物与旧 Git 目录清理

## 变更

- 从工作目录移除旧的 `.git_disabled/` 禁用仓库目录，避免继续占用约 321MB 并干扰 Git 状态判断。
- 清理可再生的 `.electron-builder-cache/`、`runtime-logs/`、`.codex-vite.*.log` 与历史 `build*.log`。
- `.gitignore` 补充 `.git_disabled/` 与 `runtime-logs/`，后续本地旧 Git 目录和运行日志不会再混入工作区。
- 保留 `.electron-user-data/`，避免删除当前本机测试状态、服务器配置或登录态。

## 验证

- 路径删除前已校验所有目标解析路径均位于 `A:\vsc\emby-player` 内。
- `git status --short --ignored` 确认清理目标不再存在，工作树仅剩 `.gitignore` 与日志状态变更。
- `npm.cmd run build`
- `git diff --check`
