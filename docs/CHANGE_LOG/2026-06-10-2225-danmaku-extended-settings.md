# 2026-06-10 22:25 弹幕扩展设置（开启默认/分区行数/粗体/记忆选择）

## 背景
按参考截图（`SETTINGS_REFERENCE_HILLSLITE.md`·弹幕）继续 1:1 复刻：开启弹幕（默认）、
滚动/顶部/底部弹幕最大行数、粗体、记忆手动选择的弹幕。

## 变更
- Rust：`danmaku_enabled_default`（默认 true，与参考一致）、`danmaku_scroll_max_rows=5`、
  `danmaku_top_max_rows=3`、`danmaku_bottom_max_rows=3`（clamp 1–20）、`danmaku_bold`、
  `danmaku_remember_selection`（默认 true）+ patch 落盘。
- `DanmakuOverlay.vue`：新增 scrollMaxRows/topMaxRows/bottomMaxRows/bold props——
  三个弹幕区车道数按设置上限封顶（仍受容器高度约束），弹幕字重 700/500，prop 变化重置车道。
- `PlayerView.vue`：
  - 传入四个新 props；
  - 「开启弹幕」默认开：进入条目自动拉取弹幕并显示（每条目仅尝试一次，local-file 走原有 sidecar 逻辑）；
  - 「记忆手动选择的弹幕」：手动导入 XML 成功后按条目记忆（localStorage），下次该条目
    自动加载记忆的 XML（失效则回退自动匹配）。
- 设置页弹幕面板按参考顺序补 6 项：开启弹幕、三个行数滑条、粗体、记忆选择。
- TS 类型 + 三处默认值 + Electron store。

## 验证
- `npm run build` 绿（7.17s）；`cargo check --features mpv-embedded` 绿（24.1s）；
  `node --check` store.mjs 绿；无 lint。
- 行为待真机：行数滑条 → 弹幕区行数收紧；进入有弹幕条目 → 自动出弹幕；
  手动导入 XML 后重进同条目 → 自动加载同一 XML。
