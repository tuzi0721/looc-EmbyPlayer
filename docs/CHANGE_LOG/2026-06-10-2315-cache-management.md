# 2026-06-10 23:15 缓存管理（大小显示 + 一键清理）

## 背景
按参考截图（`SETTINGS_REFERENCE_HILLSLITE.md`·通用）复刻「缓存管理」：显示缓存
占用并支持一键清理。

## 变更
- Rust `commands/settings.rs`：`get_cache_usage` / `clear_app_cache` 命令
  （spawn_blocking 遍历），统计/清理目标：WebView2 profile 的 Cache、Code Cache、
  GPUCache + `%TEMP%/hills-lite-stream-cache`（流媒体预取）。被占用文件静默跳过，
  重启后释放。`lib.rs` 注册。
- 前端 `api/index.ts`：`CacheUsage` 类型 + `getCacheUsage/clearAppCache`。
- Electron `main.mjs`：等价实现（`session.getCacheSize/clearCache/clearStorageData`）。
- 设置页通用区新增「缓存管理」行 + 面板：分项大小、刷新、清理按钮、状态行；
  汇总标签显示总大小。

## 验证
- `npm run build` 绿（6.90s）；`cargo check` 绿（23.2s）；`node --check` main.mjs 绿；
  Electron command coverage 绿（111 renderer/107 handlers/5 no-op）；无 lint。
- 行为待真机：打开面板显示各项大小 → 清理后数值下降。
