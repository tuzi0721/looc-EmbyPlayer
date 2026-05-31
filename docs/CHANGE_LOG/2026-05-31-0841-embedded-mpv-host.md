# 2026-05-31 08:41 播放窗口内嵌宿主接线

## 背景

用户明确要求播放窗口必须内嵌。此前前端硬编码 `embedVideo = false`，Electron 的 `embed_*` 命令是 no-op；Tauri IPC 后端虽然有嵌入宿主窗口，但启动 mpv 时没有传入 `--wid`。

## 变更

- 前端播放器不再硬编码关闭内嵌；Electron / Tauri 运行时会启用嵌入宿主，普通 Web Preview 仍保持关闭。
- Electron `embed_*` 从 no-op 改为真实处理：
  - 创建应用托管的嵌入宿主窗口。
  - 把宿主原生窗口句柄传给随包 mpv。
  - `embed_set_rect` 跟随播放器画面区域移动/缩放。
  - `embed_detach` 会关闭 mpv 并销毁宿主窗口。
- Electron mpv 启动支持嵌入句柄：
  - 有嵌入宿主时传 `--wid=<handle>` 与 `--force-window=no`。
  - 无嵌入宿主时仍走原来的独立窗口兜底。
- Electron 支持 `HILLS_ELECTRON_USER_DATA_DIR` 测试隔离目录，真实联调可把账号态写入临时目录，避免污染当前 `.electron-user-data`。
- Tauri IPC mpv 启动补齐 `--wid` 传参，有宿主时不再强制创建独立 mpv 窗口。
- 前端 rect 同步会先同步一次尺寸再显示宿主，并在控制栏显示时避开顶部/底部控制区域，降低原生窗口遮住控制栏的风险。

## 验证

- `node --check electron\backend\mpv.mjs`
- `node --check electron\main.mjs`
- `npm.cmd run check:electron-commands`
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- `npm.cmd run build`
- 本阶段触碰文件行尾空白检查
- `npm.cmd run electron:build`
- Electron 运行时 embed smoke：启动 Electron 预览窗口，通过调试端口调用 `embed_attach` / `embed_set_rect` / `embed_set_visible` / `embed_detach`，返回 `{ ok: true }`。
- Electron 真实内嵌播放 smoke：使用临时 userData 目录启动 Electron 预览，测试账号登录 443 线路后调用嵌入宿主播放测试条目；mpv 返回 `durationMs = 866026`、`trackCount = 4`、`paused = false`、`eof = false`，并在结束后删除临时 userData。验证输出未包含密码、token 或完整播放 URL。

## 结果

内嵌播放的 Electron/Tauri 命令链路已从 no-op 改为实际接线，打包产物、Electron 运行时 embed 命令 smoke 和真实内嵌播放 smoke 均通过。下一步可继续做人工视觉目检，确认控制栏遮挡、全屏和 resize 体验。
