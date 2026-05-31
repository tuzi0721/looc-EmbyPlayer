# 字幕堆叠 / 第二字幕轨

目标清单里的“字幕堆叠”此前没有真实运行时能力。这个阶段把 mpv 的第二字幕轨接入播放器，让用户可以保留主字幕，同时叠加另一条外挂或服务器字幕。

## 变更

- `MpvSnapshot` 新增 `secondarySubId`，Electron 与 Tauri 都会从 mpv `secondary-sid` 读取当前第二字幕轨。
- 新增 `set_secondary_subtitle_track` 平台命令，Electron、Tauri IPC 和 Tauri embedded 后端都映射到 mpv `secondary-sid` / `secondary-sub-visibility`。
- 前端 API 与 player store 新增 `setSecondarySubtitleTrack()`。
- 字幕面板新增“第二字幕”区，存在多条字幕时可选择第二字幕或关闭第二字幕；当前主字幕会在第二字幕列表中标记为“主字幕”并禁止重复选择。
- 切换主字幕时，如果新主字幕正好是当前第二字幕，会先自动关闭第二字幕，避免同一轨道重复叠加。
- Web Preview 不伪造 mpv 能力，新增命令保持 no-op fallback。

## 验证

- `node --check electron\backend\mpv.mjs`
- `node --check electron\main.mjs`
- `npm.cmd run check:electron-commands`
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- `npm.cmd run build`
- `git diff --check`
- `Invoke-WebRequest -UseBasicParsing http://127.0.0.1:1421/` 返回 `200`
- `npm.cmd run electron:build`

## 边界

- in-app Browser 仍被 Browser URL policy 拒绝打开 `127.0.0.1` 本地预览，因此本阶段没有浏览器视觉目检。
- 本阶段完成的是命令、快照和 UI 入口闭环；真实双字幕叠加画面仍建议在真实媒体播放中人工看一遍。

## 下一步

继续从目标清单里挑未完全落地的用户功能推进。字幕方向下一段可继续做真实场景验证或字幕截图安全重置；播放器方向可继续补最小窗口约束、控制栏 resize 人工验证等体验项。
