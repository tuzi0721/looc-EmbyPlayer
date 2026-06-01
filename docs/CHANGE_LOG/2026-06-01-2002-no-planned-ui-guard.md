# 2026-06-01 20:02 未接入 UI 文案门禁

## 背景

设置页假入口已经清理，但仅靠人工复查容易回归。为了避免“待接入 / 计划中 / 未实现”这类不能使用的入口重新出现在用户界面里，本阶段把源码扫描升级为构建门禁。

## 变更

- 新增 `scripts/check-no-planned-ui.mjs`，扫描 `src` 与 `electron` 下的用户界面源码。
- 禁止 `待接入`、`计划中`、`未接入`、`未实现`、`敬请期待`、`not implemented` 与 `coming soon` 等占位文案进入用户界面源码。
- 新增 `npm.cmd run check:no-planned-ui`。
- `npm.cmd run build` 现在会先执行 `check:local-decode`，再执行 `check:no-planned-ui`，随后才进入类型检查和 Vite 构建。

## 验证

- `node --check scripts\check-no-planned-ui.mjs`
- `npm.cmd run check:no-planned-ui`
- `npm.cmd run check:local-decode`
- `npm.cmd run build`
- `git diff --check`
- `npm.cmd run electron:build`
