# 2026-05-29 08:15 - 切轨保留缓存
## 本段目标
- 新增“切换音轨/字幕轨时保留缓存”播放行为开关，默认开启；用户关闭后，切换音轨或字幕轨时恢复更接近旧体验的清缓存行为。

## 变更
- `AppSettings`、Electron store、Tauri config 与设置更新命令新增 `preserveTrackSwitchCache` / `preserve_track_switch_cache`，默认开启。
- 设置页播放器面板新增“切换轨道时保留缓存”开关。
- Electron `set_audio_track` / `set_subtitle_track` 会读取该设置：默认只切换 `aid` / `sid`，关闭该开关时切轨后显式执行 mpv `drop-buffers`。
- Tauri `MpvCommand::SetAudioTrack` / `SetSubtitleTrack` 改为携带 `preserve_cache`；IPC 与 embedded 后端在开关关闭时切轨后尝试执行 `drop-buffers`，失败只写 warn，不让切轨失败。
- Emby/Jellyfin 远程会话命令 `SetAudioStreamIndex` / `SetSubtitleStreamIndex` 也复用同一设置。

## 验证
- `node --check electron\main.mjs` 通过。
- `node --check electron\backend\store.mjs` 通过。
- `cargo fmt --manifest-path src-tauri\Cargo.toml` 通过。
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets` 通过。
- `npm.cmd run build` 通过；仍仅有既有 PlayerView chunk 体积警告。
- `rg -n "[ \t]+$" electron\main.mjs electron\backend\store.mjs src\types\models.ts src\stores\settings.ts src\views\SettingsView.vue src-tauri\src\config\models.rs src-tauri\src\commands\settings.rs src-tauri\src\commands\player.rs src-tauri\src\mpv\backend.rs src-tauri\src\mpv\ipc.rs src-tauri\src\mpv\embedded.rs src-tauri\src\emby\session_controller.rs` 无输出。
- `npm.cmd run electron:build` 通过；仍仅有既有 PlayerView chunk 体积、electron-builder author/duplicate dependency、DEP0190 警告。
- 本轮未做真实媒体播放中的人工切轨实测；已完成命令路径、类型、构建和打包验证。
