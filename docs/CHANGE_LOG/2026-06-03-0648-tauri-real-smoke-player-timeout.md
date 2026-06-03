# 2026-06-03 06:48 Tauri real smoke player timeout

## 背景
- 已刷新包含 all-account media commands 的 06:46 Tauri release exe。

## 本阶段执行
- 使用真实账号与真实服务器重跑 Tauri release visual smoke。

## 结果
- 已完成并越过：
  - CDP connect
  - setup / 真实 PlaybackInfo
  - 首页 5 个尺寸
  - 详情页 5 个尺寸
  - 剧集详情页 5 个尺寸
  - `/favorites`、`/history`、`/aggregate`
  - 搜索 command 阶段不再缺失，但本轮结果 `count=0`
  - 剧集详情页播放探针打开真实单集 `/player/34758?...`
  - 详情页播放打开真实播放器路由 `/player/25372?...`
- 随后播放器阶段失败于：
  - `Runtime.evaluate timeout`

## 结论
- Tauri release 已进入真实播放路由，但播放器阶段某个 evaluate 卡住；当前脚本未标出具体子步骤。
- 该阶段仍不能声明播放视检通过。
- 下一步给播放器阶段关键 evaluate 增加 stage 标记和失败诊断，定位是 ready 等待、mpv 状态、native capture 还是 resize 检查卡住。
