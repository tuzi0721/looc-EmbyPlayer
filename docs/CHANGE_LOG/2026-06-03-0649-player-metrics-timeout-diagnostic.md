# 2026-06-03 06:49 Player metrics timeout diagnostic

## 背景
- 真实 Tauri visual smoke 已进入播放器路由，但播放器阶段失败于泛化的 `Runtime.evaluate timeout`，缺少具体卡点。

## 本阶段修改
- `scripts/real-server-visual-smoke.mjs`
  - `metricsExpression()` 内部对 `window.hillsLite.invoke("get_state")` / `api.getState()` 增加 2.5 秒页面内超时。
  - metrics 返回 `mpvStateTimedOut`，避免单次 mpv 状态调用把整个 CDP evaluate 拖到 60 秒超时。
  - `waitForPlaybackVisualReady()` 与 `player-metrics-captured` 输出包含 `mpvStateTimedOut`。

## 验证
- `node --check scripts\real-server-visual-smoke.mjs`

## 结果
- 脚本语法通过。
- 下一步直接重跑真实 visual smoke，定位播放器阶段是否为 mpv 状态命令卡住。
