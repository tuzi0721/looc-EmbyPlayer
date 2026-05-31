# GitHub 本地提交与推送凭据阻塞

## 背景

用户确认 GitHub 远端现有内容需要舍弃，当前本地工作树作为可信版本提交。

## 结果

- 已恢复普通 `.git` 仓库可用状态，并保留 `.git_disabled` 为本地备份目录，已通过 `.git/info/exclude` 防止其进入提交。
- 已完成本地提交 `17859e2`，提交信息为 `chore: reset remote to current app state`。
- 提交前已验证敏感信息扫描无命中，`node --check electron/main.mjs`、`node --check scripts/smoke-electron-embedded-local.mjs`、`npm.cmd run check:electron-commands` 与 `npm.cmd run build` 均通过。
- 远端 `origin/main` 可读取，但 push 需要 GitHub 写入凭据；当前本机没有可用的非交互凭据，禁用交互提示后返回 `could not read Password`。

## 下一步

本地提交保持在 `main` 上，等待本机 GitHub 凭据可用后可直接推送覆盖远端；项目实现继续推进内嵌播放黑屏修复。
