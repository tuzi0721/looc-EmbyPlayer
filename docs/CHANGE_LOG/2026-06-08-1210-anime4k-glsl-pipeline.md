# 2026-06-08 12:10 Anime4K GLSL 超分管线 + 播放器画质菜单

## 动机

对标 Hills Lite 参考应用，为 mpv 后端接入标准 Anime4K v3.2 GLSL 着色器，在保持本机 Direct Play/Stream 的前提下提供可切换的画质增强档位。

## 变更

- `src-tauri/resources/mpv/shaders/` — 随包 39 个 `Anime4K_*.glsl`（自参考应用取用）。
- `src-tauri/src/mpv/anime4k.rs` — 档位预设与 shader 路径解析；`paths.rs` 增加 `resolve_shader_dir()`。
- `src-tauri/src/config/models.rs` — 新增 `Anime4kMode` 与 `anime4kMode` 持久化字段。
- `src-tauri/src/mpv/{embedded,ipc}.rs` — `MpvCommand::SetAnime4kMode` 经 `change-list glsl-shaders` 运行时切换。
- `src-tauri/src/commands/{player,settings}.rs` — `set_anime4k_mode` 命令；播放加载后自动套用已保存档位。
- `src/views/PlayerView.vue` — 播放器设置菜单新增 Anime4K 档位：关闭 / Mode A 快 / A / B / C / 高质 (A+A)。
- `src/views/SettingsView.vue` — 画质增强面板标注 Anime4K 已可用。

## 档位说明

| 档位 | 用途 |
|------|------|
| 关闭 | 清空 `glsl-shaders` |
| Mode A 快 | 低负载 Mode A（M 级 CNN） |
| Mode A | 1080p 动画（VL + M 组合） |
| Mode B | 720p 动画（Soft VL） |
| Mode C | 480p / 纯净源（Denoise VL） |
| 高质 (A+A) | 双次 Restore + Upscale |

## 验证

- `npm.cmd run build` — 通过
- `cargo check --features mpv-embedded --offline` — 通过
- shader 随 `build.rs` 复制到 `target/*/resources/mpv/shaders/`（39 个文件）

## 备注

- 仅作用于内嵌 / IPC mpv 后端；Web 预览 HTML5 播放器不显示该菜单。
- 不触发服务器转码；仅 GPU 后处理。
