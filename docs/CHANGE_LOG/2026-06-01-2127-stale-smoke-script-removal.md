# 旧 smoke 脚本清理

## 背景

用户要求清理项目里的无关代码和无法使用的旧文件。扫描脚本目录后发现 `scripts/smoke-test.ps1` 仍保留早期 Tauri-first 验证流程，并且在随包 mpv 缺失时输出“可能使用 PATH mpv”的旧提示。这与当前 Electron 主线和随包 mpv 唯一路径相冲突。

## 变更

- 删除 `scripts/smoke-test.ps1`。
- 当前保留的验证入口继续以这些脚本为准：
  - `npm.cmd run build`
  - `npm.cmd run electron:build`
  - `node scripts\smoke-electron-home-hero.mjs`
  - `node scripts\smoke-electron-embedded-local.mjs`
  - `scripts\test-playback-flow.ps1`（仍要求随包 mpv 缺失时直接失败）

## 验证

- 通过：`rg -n "smoke-test\.ps1|PATH mpv|IPC may use PATH mpv" scripts package.json electron src src-tauri -g "!src-tauri/target/**"`
  - 当前源码、脚本和构建入口无旧 smoke 文件和 PATH mpv 提示残留。
- 通过：`git diff --check`
- 通过：`npm.cmd run check:workspace`

## 风险

- 删除的是未被当前 package scripts 或现行状态文档引用的旧脚本，不影响当前构建和 smoke 流程。

## 回滚

- 从上一提交恢复 `scripts/smoke-test.ps1` 并删除本日志即可；不建议恢复，因为旧脚本会重新引入 PATH mpv 误导。
