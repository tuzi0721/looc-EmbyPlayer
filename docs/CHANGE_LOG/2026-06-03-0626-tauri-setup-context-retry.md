# 2026-06-03 06:26 Tauri setup context retry

## 背景
- 真实 visual smoke 已进入 WebView2 CDP，并在 `setup-start` 阶段遇到启动期 `Execution context was destroyed`。

## 本阶段修改
- `scripts/real-server-visual-smoke.mjs` 将 `setup-start` 的首次大段 `Runtime.evaluate` 从 `cdpEval` 改为 `cdpEvalAfterContextReset`。
- 重试次数设置为 12 次，覆盖 Tauri/WebView2 启动期导航或上下文重建。

## 验证
- `node --check scripts\real-server-visual-smoke.mjs`

## 结果
- 脚本语法通过。
- 该阶段只修自动化稳定性；下一步继续用 06:24 的 Tauri release exe 重跑真实 visual smoke。
