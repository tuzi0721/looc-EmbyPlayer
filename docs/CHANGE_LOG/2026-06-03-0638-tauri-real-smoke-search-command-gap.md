# 2026-06-03 06:38 Tauri real smoke search command gap

## 背景
- 已刷新包含 Tauri `get_playback_source` command 的 06:36 release exe。

## 本阶段执行
- 使用真实账号与真实服务器重跑 Tauri release visual smoke。

## 结果
- 已越过 CDP、setup 和真实 PlaybackInfo：
  - `setup-complete`
  - 真实媒体库视图：5
  - resume：1
  - hero：36
  - mediaSourceCount：1
- 已完成真实首页 5 个尺寸视检。
- 已完成真实详情页 5 个尺寸视检。
- 已完成真实剧集详情页 5 个尺寸视检。
- 已完成个人页路由 `/favorites`、`/history`、`/aggregate` 检查。
- 随后在搜索阶段失败：
  - `Command search_all_accounts not found`

## 结论
- Tauri 已进入真实服务器页面视检链路，但后端缺少 `search_all_accounts` command。
- 该缺口对应多服务器搜索能力，不能在 smoke 里绕过。
- 下一步补 Tauri `search_all_accounts` command，并保持同名不同服务器记录可并存的 source/account 标识。
