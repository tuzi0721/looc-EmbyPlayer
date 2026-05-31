# 2026-05-31 08:04 - 播放源切换运行时补齐

## 摘要
- 补齐播放线路 / 媒体源切换在 Tauri 与外部播放器路径上的参数透传，避免 Electron 内部播放已支持 `lineId`，但其他运行路径忽略线路选择。
- Tauri `play` 与 `play_external` 现在都能接收 `lineId` / `mediaSourceId`，并用指定线路请求 `PlaybackInfo`、构造流 URL、生成 mpv / 外部播放器 headers。
- Tauri 当前播放会话记录 `lineId`，服务器字幕列表也按当前会话线路重新请求与拼接字幕 URL。
- Electron 外部播放器入口同步透传 `lineId` / `mediaSourceId`，前端 API 类型允许调用方指定这两个字段。

## 主要改动
- `src-tauri/src/emby/client.rs`：新增 `playback_info_for_line()`、`build_stream_url_for_line()` 与可指定线路的 `pick_line()`。
- `src-tauri/src/commands/player.rs`：`play` / `play_external` payload 增加 `lineId`，并在开流、headers 和会话记录中使用指定线路。
- `src-tauri/src/state.rs`、`src-tauri/src/commands/subtitle.rs`：当前播放会话记录线路，字幕查询跟随播放时的线路。
- `electron/main.mjs`：外部播放器开流透传线路与媒体源选择。
- `src/api/index.ts`：`playExternal()` 类型补齐 `lineId` / `mediaSourceId`。

## 验证
- `node --check electron\main.mjs`
- Electron 假 `PlaybackInfo` smoke：指定 `line-b` + `source-b` 后，`mpvPlaybackSource()` 返回 `lineId=line-b`、`mediaSourceId=source-b`、2 个媒体源候选、2 个线路候选，并从指定线路 base URL 请求 `PlaybackInfo`。
- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- `npm.cmd run check:electron-commands`
- 本阶段触碰文件行尾空白检查：无新增命中。
- `npm.cmd run build`
- `npm.cmd run electron:build`：Electron unpacked 构建通过，`check:electron-package` 确认 6 个随包 mpv 文件进入 `release-electron\win-unpacked\resources\mpv`。

## 备注
- 该阶段没有重新写入或暴露真实账号密码、token 或完整播放 URL。
- 线路2的真实播放仍受上游 / 反代 Cloudflare 403 阻断；本阶段补齐的是本地运行时链路，不改变外部服务可达性。
