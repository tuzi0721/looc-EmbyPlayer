# 2026-06-11 14:15 自研播放器路径：过阈值显式标记已看

## 背景
T10 进度写回闭环的最后一环：standalone（自研播放器）路径此前仅上报
`Sessions/Playing/Stopped`，「标记已看」依赖 Emby 服务端近片尾启发式。
对齐前端嵌入路径（`stores/player.ts` stop() 的 `markWatchedThresholdPct` 逻辑），
在 standalone 停止上报后，若停止位置过阈值则显式标记已看。

## 变更（Rust，仅 standalone 路径）
- `mpv/standalone.rs`：
  - `StandaloneStartRequest` + `ReportState` 新增 `runtime_ms: Option<i64>`
    （来自 Emby `RunTimeTicks`）与 `mark_watched_threshold_pct: u32`。
  - `report_stopped` 在上报 Stopped 后：若 `runtime_ms>0` 且
    `position/runtime*100 >= 阈值`，调用既有 `EmbyClient::set_played(item, true)`
    显式标记已看（失败仅 warn，不影响停止流程；仍受 `stopped` 原子去重保护，整场一次）。
- `commands/player.rs`：`play_standalone` 构造请求时传入
  `runtime_ms = item.run_time_ticks/10000` 与 `settings.mark_watched_threshold_pct`。

## 验证
- `cargo check --features mpv-embedded` 绿（18.8s，无遗漏构造点）；ReadLints 无错误。
- 行为待真机：看到 ≥阈值 后退出 → 条目显示已看；未过阈值退出 → 只更新 resume，不标记。

## 说明
runtime 未知（RunTimeTicks 缺失）时不自动标记，避免误判。embedded 路径原有阈值逻辑不变。
