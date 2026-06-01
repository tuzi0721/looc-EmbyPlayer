# 2026-06-01 19:07 本机解码会话上报收紧

## 目标
- 将“解码必须由本机承担，不能让 Emby/Jellyfin 服务端解码或转码”继续落实到播放会话上报层，避免 UI 或旧路径把会话误报成服务端转码相关状态。

## 改动
- `electron/backend/emby.mjs`
  - 播放源返回 `playMethod`，按媒体源 `SupportsDirectPlay` 优先标记 `DirectPlay`，否则在明确支持本机直流时标记 `DirectStream`。
  - `Sessions/Playing/Progress` 上报新增播放方法清洗：只允许 `DirectPlay` / `DirectStream`，其它值一律回退到 `DirectPlay`。
- `electron/main.mjs`
  - 当前播放会话记录后端确认的 `playMethod`，进度上报时优先用当前会话方法覆盖前端传值。
- `src/platform/index.ts`
  - Web Preview 播放源和候选媒体源同步带出 `playMethod`，进度上报同样按当前播放源清洗。
- `src/stores/player.ts`、`src/views/PlayerView.vue`
  - HTML 内嵌播放与轮询上报改用当前播放源实际方法，不再硬编码 `DirectStream`。
- `src-tauri/src/*`
  - Tauri 当前播放会话保存 `play_method`，进度上报时用后端会话值覆盖前端传值，并清洗非法方法。
- `scripts/check-local-decode-guard.mjs`
  - 本机解码门禁增加播放方法锚点，防止后续绕过清洗逻辑。

## 验证
- 通过：`node --check electron\backend\emby.mjs`
- 通过：`node --check electron\main.mjs`
- 通过：`node --check scripts\check-local-decode-guard.mjs`
- 通过：`npm.cmd run check:local-decode`
- 通过：`cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- 通过：`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- 通过：`npm.cmd run check:electron-commands`
- 通过：`npm.cmd run build`

## 回滚
- 回退本次 `playMethod` 字段、会话覆盖与清洗逻辑即可；不建议回滚，因为这会重新允许前端硬编码或误传播放方法。
