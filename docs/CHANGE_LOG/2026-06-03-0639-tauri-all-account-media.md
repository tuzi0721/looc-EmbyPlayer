# 2026-06-03 06:39 Tauri all-account media commands

## 背景
- 真实 Tauri visual smoke 已完成首页/详情/剧集详情/个人页检查，但搜索阶段失败于 `Command search_all_accounts not found`。
- 前端 API 还声明了 `list_items_all_accounts` 与 `resume_items_all_accounts`，Tauri 后端同样需要对齐。

## 本阶段修改
- `src-tauri/src/emby/models.rs`
  - `MediaItem` 新增可选 `_source` 字段，包含 `serverId`、`accountId`、`serverName`、`username`。
- `src-tauri/src/commands/media.rs`
  - 新增 `list_items_all_accounts`。
  - 新增 `search_all_accounts`。
  - 新增 `resume_items_all_accounts`。
  - 聚合策略与 Electron 保持一致：顺序查询所有可用账号，成功结果合并并标注 `_source`；仅当全部失败时返回第一个错误。
- `src-tauri/src/lib.rs`
  - 注册三类 all-account media commands。

## 验证
- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## 结果
- Tauri all-account media command 编译通过。
- 下一步刷新 release exe，并继续真实 visual smoke。
