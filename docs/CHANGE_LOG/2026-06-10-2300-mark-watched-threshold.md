# 2026-06-10 23:00 标记已看的进度阈值

## 背景
按参考截图（`SETTINGS_REFERENCE_HILLSLITE.md`·播放器）复刻「标记已看的进度阈值」：
播放进度超过阈值百分比时，停止播放即显式标记条目已看（不依赖服务器启发式）。

## 变更
- Rust：`mark_watched_threshold_pct: u32`（默认 90，patch clamp 50–100）。
- `stores/player.ts` `stop()`：停止上报后，若 `position/duration*100 >= 阈值`，
  调用 `set_item_played(value=true)` 显式标记（fire-and-forget，失败静默）。
- 设置页播放器面板新增滑条（50–100%）。
- TS 类型 + 三处默认值 + Electron store。

## 验证
- `npm run build` 绿（7.43s）；`cargo check --features mpv-embedded` 绿（24.0s）；
  `node --check` store.mjs 绿；无 lint。
- 行为待真机：看到 95% 停止 → 条目立即显示已看徽标。
