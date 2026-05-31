# 2026-05-29 08:55 - 字幕样式控制
## 本段目标
- 扩展播放器字幕面板，把字幕大小从临时会话控制升级为可持久化的样式控制，并让新播放会话自动套用用户偏好。

## 变更
- `AppSettings`、Electron store、Tauri config 与设置更新命令新增字幕样式字段：比例、文字颜色、描边颜色、描边宽度、阴影偏移、垂直位置和是否强制覆盖 ASS 样式。
- `SubtitlePanel` 的“字幕大小”扩展为“字幕样式”，新增颜色 swatch、描边宽度、阴影偏移、垂直位置、强制覆盖 ASS 开关和一键恢复默认。
- 渲染层新增 `api.setSubtitleStyle` 与 `player.setSubtitleStyle`，样式调整后会保存设置并立即下发到当前 mpv 会话。
- Electron 播放开始后会读取持久设置并设置 mpv `sub-scale`、`sub-color`、`sub-outline-color`、`sub-outline-size`、`sub-shadow-offset`、`sub-pos` 和 `sub-ass-override`；运行中修改也走同一组属性。
- Tauri IPC 与 embedded mpv 后端新增 `MpvCommand::SetSubtitleStyle`，播放开始后会 best-effort 套用设置，运行中修改会返回真实命令结果。
- Tauri 设置更新会限制数值范围，并对字幕颜色保留 `#RRGGBB` 格式校验。

## 验证
- `node --check electron\main.mjs` 通过。
- `node --check electron\backend\store.mjs` 通过。
- `cargo fmt --manifest-path src-tauri\Cargo.toml` 通过。
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets` 通过。
- `npm.cmd run build` 通过；仍仅有既有 PlayerView chunk 体积警告。
- 使用本地静态 server 打开 `dist` 产物，浏览器能加载 Hills Lite 首屏；由于没有真实播放会话，本轮未在浏览器里打开字幕面板做人工视觉目检。
- `rg "[ \t]+$" src\types\models.ts src\stores\settings.ts electron\backend\store.mjs electron\main.mjs src\api\index.ts src\stores\player.ts src\components\player\SubtitlePanel.vue src-tauri\src\config\models.rs src-tauri\src\commands\settings.rs src-tauri\src\commands\subtitle.rs src-tauri\src\commands\player.rs src-tauri\src\mpv\backend.rs src-tauri\src\mpv\ipc.rs src-tauri\src\mpv\embedded.rs src-tauri\src\mpv\mod.rs src-tauri\src\lib.rs` 无输出。
- `npm.cmd run electron:build` 通过；仍仅有既有 PlayerView chunk 体积、electron-builder author/duplicate dependency、DEP0190 警告。
- 本轮未做真实视频字幕样式渲染实测；已完成设置链路、类型、Rust 编译、前端构建、Electron 打包和静态首屏加载验证。
